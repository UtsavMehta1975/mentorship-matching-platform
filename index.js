// Importing necessary modules
const { Pool } = require('pg');
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser'); // Import body-parser
const session = require('express-session'); // Import express-session
const multer = require('multer');
const fs = require('fs');

// Configure PostgreSQL connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'mentorship',
  password: '456321QWSAzx', // Your actual PostgreSQL password
  port: 5432
});

// Function to execute a query
const query = (text, params) => pool.query(text, params);

// Example of using the query function to check connection
query('SELECT NOW()', [])
  .then(res => console.log(res.rows[0]))
  .catch(err => console.error('Error executing query', err.stack));

// Initialize the Express application
const app = express();
const PORT = process.env.PORT || 4000; // Change the port to 4000

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Set the view engine to EJS
app.set('view engine', 'ejs');

// Parse incoming request bodies
app.use(bodyParser.urlencoded({ extended: true }));

// Set up session handling
app.use(session({
  secret: 'your_secret_key', // Replace with your own secret key
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
  const username = req.session.username; // Retrieve username from session
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
  res.render('index'); // Render the EJS template
});

// Serve the registration page
app.get('/register', (req, res) => {
  res.render('register'); // Render the EJS template
});

// Handle registration form submission
app.post('/register', (req, res) => {
  const { username, password } = req.body;

  // Check if the username already exists
  query('SELECT * FROM users WHERE username = $1', [username])
    .then(result => {
      if (result.rows.length > 0) {
        // Username already exists
        res.status(400).send('Username already taken. Please choose a different username.');
      } else {
        // Save user to database
        query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, password])
          .then(() => {
            res.redirect('/login'); // Redirect to the login page after successful registration
          })
          .catch(err => res.status(500).send('Error registering user.'));
      }
    })
    .catch(err => res.status(500).send('Error checking username.'));
});

// Serve the login page
app.get('/login', (req, res) => {
  res.render('login'); // Render the EJS template
});

// Handle login form submission
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  // Verify user credentials
  query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password])
    .then(result => {
      if (result.rows.length > 0) {
        // Store username in session
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
  res.render('profile'); // Render the EJS template
});

// Handle profile form submission with file uploads
app.post('/profile', upload.fields([{ name: 'profilePicture' }, { name: 'coverPhoto' }]), (req, res) => {
  const { role, skills, interests, bio } = req.body;
  const profilePicture = req.files['profilePicture'] ? req.files['profilePicture'][0].filename : null;
  const coverPhoto = req.files['coverPhoto'] ? req.files['coverPhoto'][0].filename : null;
  const username = req.session.username; // Retrieve username from session
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
  const username = req.session.username; // Retrieve username from session
  if (!username) {
    return res.status(400).send('User not logged in');
  }
  query('DELETE FROM users WHERE username = $1', [username])
    .then(() => {
      req.session.destroy(); // Destroy the session
      res.send('Profile deleted successfully!');
    })
    .catch(err => res.status(500).send('Error deleting profile.'));
});

// Serve the user discovery page
app.get('/discover', (req, res) => {
  res.render('discover', { users: [] }); // Render the EJS template with an empty users array
});

// Handle user discovery and matchmaking
app.post('/discover', (req, res) => {
  const { role, skills, interests } = req.body;
  
  // Query database to find matches
  let queryText = 'SELECT * FROM users WHERE 1=1';
  const queryParams = [];
  if (role) {
    queryText += ' AND role = $1';
    queryParams.push(role);
  }
  if (skills) {
    queryText += ' AND skills ILIKE $2';
    queryParams.push(`%${skills}%`);
  }
  if (interests) {
    queryText += ' AND interests ILIKE $3';
    queryParams.push(`%${interests}%`);
  }

  query(queryText, queryParams)
    .then(result => res.render('discover', { users: result.rows })) // Pass the users to the template
    .catch(err => res.status(500).send('Error fetching users.'));
});

// Serve the connection request page
app.get('/connect', (req, res) => {
  query('SELECT username FROM users WHERE role = $1', ['mentor'])
    .then(result => res.render('connection', { mentors: result.rows }))
    .catch(err => res.status(500).send('Error fetching mentors.'));
});

// Handle connection request form submission
app.post('/connect', (req, res) => {
  const { mentor } = req.body;
  const username = req.session.username; // Retrieve username from session
  if (!username) {
    return res.status(400).send('User not logged in');
  }

  // Check if a connection request already exists
  query('SELECT * FROM connections WHERE mentor_id = (SELECT id FROM users WHERE username = $1) AND mentee_id = (SELECT id FROM users WHERE username = $2)', [mentor, username])
    .then(result => {
      if (result.rows.length > 0) {
        // Connection request already exists
        res.status(400).send('Connection request already sent.');
      } else {
        // Create a new connection request
        return query('INSERT INTO connections (mentor_id, mentee_id, status) VALUES ((SELECT id FROM users WHERE username = $1), (SELECT id FROM users WHERE username = $2), $3)', 
          [mentor, username, 'pending'])
          .then(() => {
            // Retrieve user profile information
            return query('SELECT * FROM users WHERE username = $1', [username])
              .then(userResult => {
                if (userResult.rows.length > 0) {
                  const user = userResult.rows[0];
                  res.render('connection_success', {
                    message: 'Connection request sent successfully!',
                    user: {
                      username: user.username,
                      role: user.role,
                      skills: user.skills,
                      interests: user.interests,
                      bio: user.bio
                    }
                  });
                } else {
                  res.status(404).send('User profile not found');
                }
              });
          });
      }
    })
    .catch(err => res.status(500).send('Error checking connection request.'));
});

// Serve the matchmaking page
app.get('/matchmaking', (req, res) => {
  res.render('matchmaking', { matches: [] }); // Render the EJS template with an empty matches array
});

// Handle matchmaking and suggest potential matches
app.post('/matchmaking', (req, res) => {
  const { role, skills, interests } = req.body;

  // Log the received input
  console.log('Matchmaking request received with:', { role, skills, interests });

  // Query database to find potential matches
  let queryText = 'SELECT * FROM users WHERE role != $1'; // Find users with different roles
  const queryParams = [role];
  if (skills) {
    queryText += ' AND skills ILIKE $2';
    queryParams.push(`%${skills}%`);
  }
  if (interests) {
    queryText += ' AND interests ILIKE $3';
    queryParams.push(`%${interests}%`);
  }

  // Log the constructed query and parameters
  console.log('Executing query:', queryText, queryParams);

  query(queryText, queryParams)
    .then(result => {
      if (result.rows.length > 0) {
        // Matches found
        console.log('Matches found:', result.rows);
        res.render('matchmaking', { matches: result.rows });
      } else {
        // No matches found, suggest alternative actions
        console.log('No matches found');
        res.render('matchmaking', { matches: [], message: 'No matches found. Try broadening your search criteria.' });
      }
    })
    .catch(err => {
      console.error('Error fetching matches:', err);
      res.status(500).send('Error fetching matches.');
    });
});

// Serve the user dashboard
app.get('/dashboard', (req, res) => {
  const username = req.session.username; // Retrieve username from session
  if (!username) {
    return res.status(400).send('User not logged in');
  }

  // Query to fetch user profile information
  query('SELECT * FROM users WHERE username = $1', [username])
    .then(result => {
      if (result.rows.length > 0) {
        const user = result.rows[0];
        // Fetch connections and notifications
        return Promise.all([
          query('SELECT * FROM connections WHERE mentor_id = $1 OR mentee_id = $1', [user.id]),
          query('SELECT message FROM notifications WHERE username = $1', [username])
        ])
        .then(([connectionsResult, notificationsResult]) => {
          res.render('dashboard', {
            username: user.username,
            role: user.role,
            skills: user.skills,
            interests: user.interests,
            bio: user.bio,
            profilePicture: user.profile_picture, // Adding profile picture to the dashboard
            coverPhoto: user.cover_photo, // Adding cover photo to the dashboard
            connections: connectionsResult.rows,
            notifications: notificationsResult.rows
          });
        });
      } else {
        res.status(404).send('User profile not found');
      }
    })
    .catch(err => {
      console.error('Error fetching dashboard data:', err);
      res.status(500).send('Error fetching dashboard data.');
    });
});
// Serve the activity feed page
app.get('/feed', (req, res) => {
  query('SELECT * FROM activities ORDER BY timestamp DESC')
    .then(result => {
      res.render('feed', { activities: result.rows }); // Pass the activities to the template
    })
    .catch(err => {
      console.error('Error fetching activities:', err);
      res.status(500).send('Error fetching activities.');
    });
});
// Serve the messaging page
app.get('/messages', (req, res) => {
  const username = req.session.username; // Retrieve username from session
  if (!username) {
    return res.status(400).send('User not logged in');
  }

  // Fetch messages for the logged-in user
  query('SELECT * FROM messages WHERE sender_username = $1 OR receiver_username = $1 ORDER BY timestamp DESC', [username])
    .then(result => {
      res.render('messages', { messages: result.rows, username: username }); // Pass the messages and username to the template
    })
    .catch(err => {
      console.error('Error fetching messages:', err);
      res.status(500).send('Error fetching messages.');
    });
});

// Handle sending messages
app.post('/messages', (req, res) => {
  const { receiver_username, message } = req.body;
  const sender_username = req.session.username; // Retrieve username from session
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
    res.redirect('/login'); // Redirect to the login page
  });
});
// Fetch pending requests sent by the user
app.get('/pending-sent-requests', (req, res) => {
  const username = req.session.username; // Retrieve username from session
  if (!username) {
    return res.status(400).send('User not logged in');
  }

  query('SELECT * FROM connections WHERE mentee_id = (SELECT id FROM users WHERE username = $1) AND status = $2', [username, 'pending'])
    .then(result => res.json(result.rows))
    .catch(err => res.status(500).send('Error fetching sent requests.'));
});

// Fetch connection requests received by the user
app.get('/received-requests', (req, res) => {
  const username = req.session.username; // Retrieve username from session
  if (!username) {
    return res.status(400).send('User not logged in');
  }

  query('SELECT * FROM connections WHERE mentor_id = (SELECT id FROM users WHERE username = $1) AND status = $2', [username, 'pending'])
    .then(result => res.json(result.rows))
    .catch(err => res.status(500).send('Error fetching received requests.'));
});
// Fetch notification count for new connection requests
app.get('/notification-count', (req, res) => {
  const username = req.session.username; // Retrieve username from session
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
