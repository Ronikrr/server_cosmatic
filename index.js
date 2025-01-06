const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // For generating a secret key
const multer = require("multer");
const fs = require("fs");
require('dotenv').config();
const nodemailer = require('nodemailer');


const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    password: { type: String, required: true },
    email: { type: String, required: true, unique: true, match: /.+\@.+\..+/ },
    phoneNo: { type: String, match: /^[0-9]{10}$/ },
    username: { type: String, },
    profileImage: { type: String },
    status: { type: String, default: 'pending' }
});

const User = mongoose.model('Users', UserSchema);

const path = require("path");
const secretKey = crypto.randomBytes(64).toString('hex');


console.log(secretKey)
const app = express();

// Connect to MongoDB
mongoose.connect('mongodb+srv://ronikgorasiya:K5OfvY9zyTX4ARqL@versal.tl3hi.mongodb.net/new_admin')
    .then(() => {
        console.log('MongoDB connected successfully!');
    })
    .catch((err) => {
        console.error('Error connecting to MongoDB:', err);
    });
app.use(cors());
app.use(bodyParser.json());
const authenticate = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ message: 'No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, secretKey);
        console.log('Token decoded successfully:', decoded);
        req.user = decoded; // Attach the decoded user info
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token has expired.' });
        }
        console.error('Token verification failed:', error);
        res.status(401).json({ message: 'Invalid or expired token.' });
    }
};




//////////user profile image //////////////////////

app.use((err, req, res, next) => {
    res.status(500).json({ message: err.message });
});
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads'); // Directory to store uploaded files
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname)); // Unique file name
    },
});
const upload = multer({ storage });

// app.use('/uploads', express.static('uploads'));
app.use('/uploads', express.static(path.join(__dirname, 'server', 'uploads')));


app.post('/upload-profile', upload.single('profileImage'), async (req, res) => {
    console.log(req.file);
    console.log(req.body._id);
    console.log(req.file.path);

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const _id = req.body._id;
    const filePath = req.file.filename;

    try {
        // Use await and new mongoose.Types.ObjectId
        console.log('User ID:', _id);
        const updatedUser = await User.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(_id) }, // Find user by _id
            { profileImage: filePath },                 // Update the profileImage field
            { new: true }                               // Return the updated user
        );

        console.log('User:', _id);  // This should show null if no user is found
        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Add the profile image URL to the user object
        await updatedUser.save();
        // Successfully uploaded the file
        res.json({ message: 'Profile image uploaded successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error fetching user' });
    }
});


app.get("/view-profile", authenticate, async (req, res) => {
    console.log("Query:", req.query);

    try {
        const userId = req.query.userid;
        console.log("Received userId:", userId);

        // Validate the userId parameter
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ status: "error", message: "Invalid or missing User ID" });
        }

        // Convert userId to ObjectId
        const objectId = new mongoose.Types.ObjectId(userId);

        // Fetch images for the given userId, and make sure profileImage is properly queried
        const images = await User.find({ _id: objectId }).select('profileImage url');  // Changed userId to _id

        console.log("Fetched images:", images);

        if (images.length === 0) {
            return res.status(404).json({ status: "error", message: "No images found for the provided User ID" });
        }

        res.send({ status: "ok", data: images });
    } catch (error) {
        console.error("Error:", error.message);  // Log error message for better clarity
        res.status(500).json({ status: "error", message: error.message });
    }
});
app.get("/view_all_users", async (req, res) => {
    try {
        // Fetch all users from the database and select specific fields if needed
        const users = await User.find().select('name email profileImage'); // Modify fields as per your schema

        // Check if users exist
        if (users.length === 0) {
            return res.status(404).json({ status: "error", message: "No users found" });
        }

        res.send({ status: "ok", data: users });
    } catch (error) {
        console.error("Error:", error.message); // Log the error
        res.status(500).json({ status: "error", message: "An error occurred while fetching users" });
    }
});





app.post('/users', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }
        const user = new User({ name, email, password, status: 'pending' });
        console.log(user)
        const doc = await user.save();
        res.status(201).json({ message: "User  registered successfully", user: doc });
    } catch (error) {
        console.error("Error saving user:", error);
        if (error.code === 11000) {
            return res.status(400).json({ message: "Username or email already exists." });
        }
        res.status(500).json({ message: "Internal server error" });
    }
})

app.get('/users', async (req, res) => {
    try {
        const users = await User.find();
        res.status(200).json({ users });
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});
app.patch('/users/:id', async (req, res) => {
    try {
        console.log('Request received:', req.body);
        const { id } = req.params;
        const { status } = req.body;

        if (!['Approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const user = await User.findByIdAndUpdate(id, { status }, { new: true });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('Updated user:', user);
        res.json({ message: 'Status updated successfully', user });
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ error: 'Error updating user status' });
    }
});


app.post('/api/approve_user', async (req, res) => {
    try {
        const { userId, status } = req.body; // status: 'approved' or 'rejected'

        // Validate input fields
        if (!userId || !status) {
            return res.status(400).json({ message: "User ID and status are required." });
        }

        // Update user status in the database
        const updatedUser = await User.updateOne({ _id: userId }, { status });

        if (updatedUser.nModified === 0) {
            return res.status(404).json({ message: "User not found or no changes made." });
        }

        res.status(200).json({ message: "User status updated successfully." });
    } catch (error) {
        console.error("Error updating user status:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});







app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid email' });
        }
        // if (user.status !== 'Approved') return res.status(403).send({ message: `Approval is ${user.status}` });

        if (user.password !== password) {
            return res.status(400).json({ message: 'Invalid password' });
        }

        const token = jwt.sign({ id: user._id, email: user.email }, secretKey, { expiresIn: '1h' });

        res.json({ message: 'Login successful', token });
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});

app.get('/profile', authenticate, async (req, res) => {
    try {
        const { email, username, phoneNo, profileImage } = req.body;

        const updates = {};
        if (email) updates.email = email;
        if (username) updates.username = username;
        if (phoneNo) updates.phoneNo = phoneNo;
        if (profileImage) updates.profileImage = profileImage;

        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updates },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found." });
        }

        const userResponse = {
            id: updatedUser._id,
            name: updatedUser.name,
            username: updatedUser.username,
            password: updatedUser.password,
            email: updatedUser.email,
            phoneNo: updatedUser.phoneNo,
            profileImage: updatedUser.profileImage,
        };

        res.json({ message: "Profile updated successfully.", user: userResponse });
    } catch (error) {
        console.error("Error updating profile:", error);

        if (error.code === 11000) { // Handle unique constraint errors (email)
            return res.status(400).json({ message: "Email must be unique." });
        }

        res.status(500).json({ message: "Internal server error." });
    }
});



app.put('/profile', authenticate, upload.single('profileImage'), async (req, res) => {
    console.log(req.body)
    console.log(req.file)
    try {
        const { email, username, phoneNo } = req.body;

        const updates = {};
        if (email) updates.email = email;
        if (username) updates.username = username;
        if (phoneNo) updates.phoneNo = phoneNo;

        // Check if profile image is uploaded, else set default image
        if (req.file) {
            updates.profileImage = req.file.filename;
        } else {
            updates.profileImage = '../assets/img/rb_859.png'
        }

        // Update the user's information in the database
        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updates },
            {
                new: true, // Return the updated document
                runValidators: true, // Validate fields before updating
            }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found." });
        }

        const userResponse = {
            id: updatedUser._id,
            name: updatedUser.name,
            username: updatedUser.username,
            email: updatedUser.email,
            phoneNo: updatedUser.phoneNo,
            profileImage: updatedUser.profileImage,
        };

        res.json({ message: "Profile updated successfully.", user: userResponse });
    } catch (error) {
        console.error("Error updating profile:", error);

        if (error.code === 11000) { // Handle unique constraint errors
            return res.status(400).json({ message: "Email must be unique." });
        }

        res.status(500).json({ message: "Internal server error." });
    }
});



app.post('/api/products', async (req, res) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Product name is required.' });
    }

    const formattedNumber = `PROD-${String(currentProductNumber).padStart(4, '0')}`;

    const newProduct = new Product({
        name,
        number: formattedNumber,
    });

    try {
        await newProduct.save();
        currentProductNumber += 1; // Increment product number
        res.status(201).json({ message: 'Product added successfully', product: newProduct });
    } catch (err) {
        res.status(500).json({ error: 'Error adding product', details: err.message });
    }
});

// Get All Products
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find();
        res.status(200).json(products);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching products', details: err.message });
    }
});


app.listen(8000, () => {
    console.log('Server connected on port 8000');
});

