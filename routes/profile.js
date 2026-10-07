import express from "express";
import {db} from "../config/firebase.js";
import auth from "../middleware/auth.js";
import {Resend} from 'resend'
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY)

router.post("/stats", auth, async (req, res) => {
    try {

        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        const snapshot = await db
            .ref("profiles")
            .orderByChild("submittedUser")
            .equalTo(email)
            .once("value");

        const profiles = [];

        snapshot.forEach((item) => {
            profiles.push({
                id: item.key,
                ...item.val()
            });
        });

        // Total profiles submitted by this user
        const totalCount = profiles.length;

        // Group profiles by date
        const dailyCounts = {};

        profiles.forEach((profile) => {

            const date = new Date(profile.createdAt)
                .toISOString()
                .split("T")[0];

            if (!dailyCounts[date]) {
                dailyCounts[date] = 0;
            }

            dailyCounts[date]++;
        });

        // Convert object to array
        const dailyStats = Object.entries(dailyCounts)
            .map(([date, count]) => ({
                date,
                count
            }))
            .sort((a, b) => b.date.localeCompare(a.date));

        return res.json({
            success: true,
            submittedUser: email,
            totalCount,
            dailyStats
        });

    } catch (err) {

        console.error("Stats error:", err);

        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

router.post("/submit", auth, async (req, res) => {
  try {
    const { fullName, email, phone, techStack,submittedUser } = req.body;

    // Check if email already exists
    const snapshot = await db
      .ref("profiles")
      .orderByChild("email")
      .equalTo(email)
      .once("value");

    if (snapshot.exists()) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    // Send email
    await resend.emails.send({
      from: "Krack-AI <promotions@mail.krack-ai.com>",
      to: email,
      subject: "Congratulations on Your Selection",
      html: `
        <div style="font-family: Arial, Helvetica, sans-serif; font-size:16px; color:#333; line-height:1.6; max-width:600px; margin:auto;">
          <p>Hi,</p>

          <p><strong>Congratulations on your selection!</strong> 🎉</p>

          <p>
            We wish you all the best in your new role and hope you have a successful career ahead.
          </p>

          <p>
            If you're preparing for your next interview or looking to improve your interview performance on <strong>${techStack}</strong>,
            you can explore <strong>Krack-AI</strong>, an AI-powered interview assistant designed to help candidates practice and perform better.
          </p>

          <p>
            Website:
            <a href="https://www.krack-ai.com">https://www.krack-ai.com</a>
          </p>

          <p>
            Best wishes,<br />
            <strong>Team Krack-AI</strong>
          </p>
        </div>
      `,
    });

    // Save profile
    await db.ref("profiles").push({
      userId: req.user.userId,
      fullName,
      email,
      phone,
      techStack,
      createdAt: Date.now(),
      submittedUser:submittedUser
    });

    return res.status(201).json({
      success: true,
      message: "Profile Submitted Successfully",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router