const express = require('express');
const router = express.Router();
const { register, login, getMe, registerValidators, loginValidators } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', registerValidators, register);
router.post('/login', loginValidators, login);
router.get('/me', protect, getMe);

module.exports = router;
