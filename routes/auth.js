import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {db} from "../config/firebase.js";

const router = express.Router();

router.post("/register", async (req, res) => {

    try {

        const { email, password, firstName, lastName, phone } = req.body;

        const usersRef = db.ref("users");

        const snapshot = await usersRef
            .orderByChild("email")
            .equalTo(email)
            .once("value");

        if (snapshot.exists()) {

            return res.status(400).json({
                message: "Email already exists"
            });

        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = usersRef.push();

        await newUser.set({
            email,
            password: hashedPassword,
            firstName,
            lastName,
            phone
        });

        res.json({
            message: "User Registered Successfully"
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });

    }

});
router.post("/login", async (req, res) => {
    try {

        const { email, password } = req.body;

        console.log("Login attempt:", email);

        console.log(
            "JWT_SECRET exists:",
            !!process.env.JWT_SECRET
        );

        const usersRef = db.ref("users");

        const snapshot = await usersRef
            .orderByChild("email")
            .equalTo(email)
            .once("value");

        console.log(
            "User found:",
            snapshot.exists()
        );

        if (!snapshot.exists()) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        let userId;
        let user;

        snapshot.forEach(item => {
            userId = item.key;
            user = item.val();
        });

        console.log("User ID:", userId);
        console.log("Password exists:", !!user.password);

        const validPassword = await bcrypt.compare(
            password,
            user.password
        );

        console.log(
            "Password valid:",
            validPassword
        );

        if (!validPassword) {
            return res.status(400).json({
                message: "Invalid Password"
            });
        }

        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is not configured");
        }

        const token = jwt.sign(
            {
                userId,
                email: user.email
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "1d"
            }
        );

        console.log("JWT generated successfully");

        res.json({
            token,
            user: {
                userId,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone
            }
        });

    } catch (err) {

        console.error("LOGIN ERROR:", err);

        res.status(500).json({
            error: err.message
        });

    }
});

export default router