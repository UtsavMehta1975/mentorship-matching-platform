require('dotenv').config(); // Load environment variables from .env file

// Importing necessary modules
const { Pool } = require('pg');
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');

// Configure PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});

// Function to execute a query
const query = (text, params) => pool.query(text, params);

query('SELECT NOW()', [])
  .then(res => console.log(res.rows[0]))
  .catch(err => console.error('Error executing query', err.stack));

// Initialize the Express application
const app = express();
const PORT = process.env.PORT || 4000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Set the view engine to EJS
app.set('view engine', 'ejs');

// Parse incoming request bodies
app.use(bodyParser.urlencoded({ extended: true }));

// Set up session handling
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

// Ensure the uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Handle profile form submission with file uploads
app.post('/profile', upload.fields([{ name: 'profilePicture' }, { name: 'coverPhoto' }]), (req, res) => {
  const { role, skills, interests, bio } = req.body;
  const profilePicture = req.files['profilePicture'] ? req.files['profilePicture'][0].filename : null;
  const coverPhoto = req.files['coverPhoto'] ? req.files['coverPhoto'][0].filename : null;
  const username = req.session.username;
  if (!username) {
    return res.status(400).send('User not logged in');
  }

  query('UPDATE users SET role = $1, skills = $2, interests = $3, bio = $4, profile_picture = $5, cover_photo = $6 WHERE username = $7',
    [role, skills, interests, bio, profilePicture, coverPhoto, username])
    .then(() => res.send('Profile saved successfully!'))
    .catch(err => res.status(500).send('Error saving profile.'));
});

// Define the route for the home page
app.get('/', (req, res) => {
  res.render('index');
});

// Serve the registration page
app.get('/register', (req, res) => {
  res.render('register');
});

// Handle registration form submission
app.post('/register', (req, res) => {
  const { username, password } = req.body;

  query('SELECT * FROM users WHERE username = $1', [username])
    .then(result => {
      if (result.rows.length > 0) {
        res.status(400).send('Username already taken. Please choose a different username.');
      } else {
        query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, password])
          .then(() => res.redirect('/login'))
          .catch(err => res.status(500).send('Error registering user.'));
      }
    })
    .catch(err => res.status(500).send('Error checking username.'));
});

// Serve the login page
app.get('/login', (req, res) => {
  res.render('login');
});

// Handle login form submission
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password])
    .then(result => {
      if (result.rows.length > 0) {
        req.session.username = username;
        res.redirect('/dashboard');
      } else {
        res.status(401).send('Invalid credentials.');
      }
    })
    .catch(err => res.status(500).send('Error logging in.'));
});

// Serve the profile setup page
app.get('/profile', (req, res) => {
  res.render('profile');
});

// Handle profile form submission with file uploads
app.post('/profile', upload.fields([{ name: 'profilePicture' }, { name: 'coverPhoto' }]), (req, res) => {
  const { role, skills, interests, bio } = req.body;
  const profilePicture = req.files['profilePicture'] ? req.files['profilePicture'][0].filename : null;
  const coverPhoto = req.files['coverPhoto'] ? req.files['coverPhoto'][0].filename : null;
  const username = req.session.username;
  if (!username) {
    return res.status(400).send('User not logged in');
  }

  query('UPDATE users SET role = $1, skills = $2, interests = $3, bio = $4, profile_picture = $5, cover_photo = $6 WHERE username = $7',
    [role, skills, interests, bio, profilePicture, coverPhoto, username])
    .then(() => res.send('Profile saved successfully!'))
    .catch(err => res.status(500).send('Error saving profile.'));
});

// Handle profile deletion
app.post('/delete-profile', (req, res) => {
  const username = req.session.username;
  if (!username) {
    return res.status(400).send('User not logged in');
  }
  query('DELETE FROM users WHERE username = $1', [username])
    .then(() => {
      req.session.destroy();
      res.send('Profile deleted successfully!');
    })
    .catch(err => res.status(500).send('Error deleting profile.'));
});

// Serve the user discovery page
app.get('/discover', (req, res) => {
  res.render('discover', { users: [] });
});

// Handle sending messages
app.post('/messages', (req, res) => {
  const { receiver_username, message } = req.body;
  const sender_username = req.session.username;
  if (!sender_username) {
    return res.status(400).send('User not logged in');
  }

  query('INSERT INTO messages (sender_username, receiver_username, message) VALUES ($1, $2, $3)', [sender_username, receiver_username, message])
    .then(() => res.redirect('/messages'))
    .catch(err => {
      console.error('Error sending message:', err);
      res.status(500).send('Error sending message.');
    });
});

// Serve the logout route
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).send('Error logging out.');
    }
    res.redirect('/login');
  });
});

// Fetch pending requests sent by the user
app.get('/pending-sent-requests', (req, res) => {
  const username = req.session.username;
  if (!username) {
    return res.status(400).send('User not logged in');
  }

  query('SELECT * FROM connections WHERE mentee_id = (SELECT id FROM users WHERE username = $1) AND status = $2', [username, 'pending'])
    .then(result => res.json(result.rows))
    .catch(err => res.status(500).send('Error fetching sent requests.'));
});

// Fetch connection requests received by the user
app.get('/received-requests', (req, res) => {
  const username = req.session.username;
  if (!username) {
    return res.status(400).send('User not logged in');
  }

  query('SELECT * FROM connections WHERE mentor_id = (SELECT id FROM users WHERE username = $1) AND status = $2', [username, 'pending'])
    .then(result => res.json(result.rows))
    .catch(err => res.status(500).send('Error fetching received requests.'));
});

// Fetch notification count for new connection requests
app.get('/notification-count', (req, res) => {
  const username = req.session.username;
  if (!username) {
    return res.status(400).send('User not logged in');
  }

  // Count new requests where the status is 'pending'
  query('SELECT COUNT(*) FROM connections WHERE mentor_id = (SELECT id FROM users WHERE username = $1) AND status = $2', [username, 'pending'])
    .then(result => res.json({ count: result.rows[0].count }))
    .catch(err => res.status(500).send('Error fetching notification count.'));
});

// Fetch user profile by ID
app.get('/profile/:id', (req, res) => {
  const userId = req.params.id;

  query('SELECT * FROM users WHERE id = $1', [userId])
    .then(result => {
      if (result.rows.length > 0) {
        res.render('profile_view', { user: result.rows[0] });
      } else {
        res.status(404).send('User profile not found');
      }
    })
    .catch(err => res.status(500).send('Error fetching user profile'));
});

// Handle accept connection request
app.post('/accept-request', (req, res) => {
  const { requestId } = req.body;
  query('UPDATE connections SET status = $1 WHERE id = $2', ['accepted', requestId])
    .then(() => res.redirect('/connect'))
    .catch(err => res.status(500).send('Error accepting request'));
});

// Handle delete connection request
app.post('/delete-request', (req, res) => {
  const { requestId } = req.body;
  query('DELETE FROM connections WHERE id = $1', [requestId])
    .then(() => res.redirect('/connect'))
    .catch(err => res.status(500).send('Error deleting request'));
});

// Start the server and listen on the specified port
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
