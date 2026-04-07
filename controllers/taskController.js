const { body, param } = require('express-validator');
const Task = require('../models/Task');
const { validate } = require('../middleware/validate');
const mongoose = require('mongoose');

const taskValidators = [
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('status')
    .optional()
    .isIn(['todo', 'in-progress', 'done'])
    .withMessage('Status must be todo, in-progress, or done'),
  validate,
];

const updateValidators = [
  body('title').optional().trim().notEmpty().withMessage('Title cannot be blank').isLength({ max: 200 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('status')
    .optional()
    .isIn(['todo', 'in-progress', 'done'])
    .withMessage('Status must be todo, in-progress, or done'),
  validate,
];

const getTasks = async (req, res) => {
  try {
    const { search = '', status = '' } = req.query;

    const filter = { owner: req.user._id };

    if (status && ['todo', 'in-progress', 'done'].includes(status)) {
      filter.status = status;
    }

    if (search.trim()) {
      filter.title = { $regex: search.trim(), $options: 'i' };
    }

    const tasks = await Task.find(filter).sort({ updatedAt: -1 }).lean();
    res.json({ tasks });
  } catch (err) {
    console.error('getTasks error:', err);
    res.status(500).json({ message: 'Failed to fetch tasks' });
  }
};

const createTask = async (req, res) => {
  try {
    const { title, description = '', status = 'todo' } = req.body;

    const task = await Task.create({
      title,
      description,
      status,
      owner: req.user._id,
    });

    const taskObj = task.toObject();

    const io = req.app.get('io');
    io.to(`user:${req.user._id}`).emit('task:created', taskObj);

    res.status(201).json({ task: taskObj });
  } catch (err) {
    console.error('createTask error:', err);
    res.status(500).json({ message: 'Failed to create task' });
  }
};

const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid task ID' });
    }
    const { title, description, status, clientUpdatedAt } = req.body;

    const task = await Task.findOne({ _id: id, owner: req.user._id });
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    if (clientUpdatedAt) {
      const incoming = new Date(clientUpdatedAt).getTime();
      const stored = new Date(task.updatedAt).getTime();
      if (incoming < stored) {
        return res.status(409).json({
          message: 'Conflict: Your version is outdated. Latest task returned.',
          task: task.toObject(),
        });
      }
    }

    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (status !== undefined) task.status = status;

    await task.save();

    const taskObj = task.toObject();

    const io = req.app.get('io');
    io.to(`user:${req.user._id}`).emit('task:updated', taskObj);

    res.json({ task: taskObj });
  } catch (err) {
    console.error('updateTask error:', err);
    res.status(500).json({ message: 'Failed to update task' });
  }
};

const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid task ID' });
    }

    const task = await Task.findOneAndDelete({ _id: id, owner: req.user._id });
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const idStr = id.toString();
    const io = req.app.get('io');
    io.to(`user:${req.user._id}`).emit('task:deleted', { id: idStr });

    res.json({ message: 'Task deleted', id: idStr });
  } catch (err) {
    console.error('deleteTask error:', err);
    res.status(500).json({ message: 'Failed to delete task' });
  }
};

module.exports = { getTasks, createTask, updateTask, deleteTask, taskValidators, updateValidators };
