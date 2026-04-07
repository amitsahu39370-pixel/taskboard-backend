const express = require('express');
const router = express.Router();
const {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  taskValidators,
  updateValidators,
} = require('../controllers/taskController');
const { protect } = require('../middleware/auth');

router.use(protect); // All task routes require auth

router.get('/',     getTasks);
router.post('/',    taskValidators, createTask);
router.put('/:id',  updateValidators, updateTask);
router.delete('/:id', deleteTask);

module.exports = router;
