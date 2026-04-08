require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const taskRoutes = require('./routes/taskRoutes');
const User = require('./models/User');
const Task = require('./models/Task');
const mongoose = require('mongoose');

connectDB();

const app = express();
const httpServer = http.createServer(app);


const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST","DELETE","PUT"],
    credentials: true
  }
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id.toString();
    socket.user = decoded;
    next();
  } catch (err) {
    return next(new Error('Invalid or expired token'));
  }
});


app.set('io', io);


io.on('connection', (socket) => {
  socket.join(`user:${socket.userId}`);

  console.log(`🔌 Client connected: ${socket.id} (user: ${socket.userId})`);

  socket.on('task:fetch', async (data, callback) => {
    try {
      const { search = '', status = '' } = data || {};

      const filter = { owner: socket.userId };

      if (status && ['todo', 'in-progress', 'done'].includes(status)) {
        filter.status = status;
      }

      if (search.trim()) {
        filter.title = { $regex: search.trim(), $options: 'i' };
      }

      const tasks = await Task.find(filter).sort({ updatedAt: -1 }).lean();
      callback({ success: true, tasks });
    } catch (err) {
      console.error('task:fetch error:', err);
      callback({ success: false, message: 'Failed to fetch tasks' });
    }
  });

  socket.on('task:create', async (payload, callback) => {
    try {
      const { title, description = '', status = 'todo' } = payload;

      const task = await Task.create({
        title,
        description,
        status,
        owner: socket.userId,
      });

      const taskObj = task.toObject();
      io.to(`user:${socket.userId}`).emit('task:created', taskObj);

      callback({ success: true, task: taskObj });
    } catch (err) {
      console.error('task:create error:', err);
      callback({ success: false, message: 'Failed to create task' });
    }
  });

  socket.on('task:update', async (data, callback) => {
    try {
      const { id, title, description, status, clientUpdatedAt } = data;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return callback({ success: false, message: 'Invalid task ID' });
      }

      const task = await Task.findOne({ _id: id, owner: socket.userId });
      if (!task) {
        return callback({ success: false, message: 'Task not found' });
      }

      if (title !== undefined) task.title = title;
      if (description !== undefined) task.description = description;
      if (status !== undefined) task.status = status;

      await task.save();

      const taskObj = task.toObject();
      console.log("📡 Emitting task update to:", `user:${socket.userId}`);
      io.to(`user:${socket.userId}`).emit('task:updated', taskObj);

      callback({ success: true, task: taskObj });
    } catch (err) {
      console.error('task:update error:', err);
      callback({ success: false, message: 'Failed to update task' });
    }
  });

  socket.on('task:delete', async (data, callback) => {
    try {
      const { id } = data;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return callback({ success: false, message: 'Invalid task ID' });
      }

      const task = await Task.findOneAndDelete({ _id: id, owner: socket.userId });
      if (!task) {
        return callback({ success: false, message: 'Task not found' });
      }

      const idStr = id.toString();
      io.to(`user:${socket.userId}`).emit('task:deleted', { id: idStr });

      callback({ success: true, message: 'Task deleted', id: idStr });
    } catch (err) {
      console.error('task:delete error:', err);
      callback({ success: false, message: 'Failed to delete task' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});


app.use(cors());

app.use(express.json());


app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);


app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});


app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});


app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
});


const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});