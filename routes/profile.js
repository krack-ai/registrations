import express from "express";
import { db } from "../config/firebase.js";
import auth from "../middleware/auth.js";
import { Resend } from "resend";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

// Your backend public URL
// Example:
// https://api.krack-ai.com
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

// Your website URL
const WEBSITE_URL =
  process.env.WEBSITE_URL || "https://www.krack-ai.com";

/*
|--------------------------------------------------------------------------
| STATS
|--------------------------------------------------------------------------
*/

router.post("/stats", auth, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
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
        ...item.val(),
      });
    });

    const totalCount = profiles.length;

    const dailyCounts = {};

    profiles.forEach((profile) => {
      if (!profile.createdAt) return;

      const date = new Date(profile.createdAt)
        .toISOString()
        .split("T")[0];

      if (!dailyCounts[date]) {
        dailyCounts[date] = 0;
      }

      dailyCounts[date]++;
    });

    const dailyStats = Object.entries(dailyCounts)
      .map(([date, count]) => ({
        date,
        count,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return res.json({
      success: true,
      submittedUser: email,
      totalCount,
      dailyStats,
    });
  } catch (err) {
    console.error("Stats error:", err);

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/*
|--------------------------------------------------------------------------
| SUBMIT PROFILE
|--------------------------------------------------------------------------
*/

router.post("/submit", auth, async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      techStack,
      submittedUser,
    } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

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

    /*
    |--------------------------------------------------------------------------
    | Generate unique tracking ID
    |--------------------------------------------------------------------------
    */

    const trackingId = crypto.randomUUID();

    /*
    |--------------------------------------------------------------------------
    | Tracking URL
    |--------------------------------------------------------------------------
    */

    const trackingUrl =
      `${BACKEND_URL}/api/profile/track/click/${trackingId}`;

    /*
    |--------------------------------------------------------------------------
    | Send email
    |--------------------------------------------------------------------------
    */
~
    await resend.emails.send({
      from: "Krack-AI <promotions@mail.krack-ai.com>",
      to: email,
      subject: "Congratulations on Your Selection",

      html: `
        <div
          style="
            font-family: Arial, Helvetica, sans-serif;
            font-size: 16px;
            color: #333;
            line-height: 1.6;
            max-width: 600px;
            margin: auto;
          "
        >

          <p>Hi ${fullName || ""},</p>

          <p>
            <strong>Congratulations on your selection!</strong> 🎉
          </p>

          <p>
            We wish you all the best in your new role and hope you
            have a successful career ahead.
          </p>

          <p>
            If you're preparing for your next interview or looking
            to improve your interview performance on
            <strong>${techStack || "your tech stack"}</strong>,
            you can explore
            <strong>Krack-AI</strong>, an AI-powered interview
            assistant designed to help candidates practice and
            perform better.
          </p>

          <p>
            Website:
            <a
              href="${trackingUrl}"
              target="_blank"
              rel="noopener noreferrer"
            >
              https://www.krack-ai.com
            </a>
          </p>

          <p>
            Best wishes,<br />
            <strong>Team Krack-AI</strong>
          </p>

        </div>
      `,
    });

    /*
    |--------------------------------------------------------------------------
    | Save profile + tracking information
    |--------------------------------------------------------------------------
    */

    await db.ref("profiles").push({
      userId: req.user.userId,

      fullName,
      email,
      phone,
      techStack,

      createdAt: Date.now(),

      submittedUser,

      trackingId,

      emailTracking: {
        clicked: false,
        clickedAt: null,

        visited: false,
        visitedAt: null,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Profile Submitted Successfully",
    });

  } catch (err) {
    console.error("Submit error:", err);

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/*
|--------------------------------------------------------------------------
| EMAIL CLICK TRACKING
|--------------------------------------------------------------------------
|
| Email:
|
| /track/click/:trackingId
|
| User clicks email link
|       ↓
| Backend records click
|       ↓
| Redirects to website
|
|--------------------------------------------------------------------------
*/

router.get("/track/click/:trackingId", async (req, res) => {
  try {
    const { trackingId } = req.params;

    const snapshot = await db
      .ref("profiles")
      .orderByChild("trackingId")
      .equalTo(trackingId)
      .once("value");

    if (!snapshot.exists()) {
      return res.status(404).send("Invalid tracking link");
    }

    let profileKey = null;
    let profile = null;

    snapshot.forEach((item) => {
      profileKey = item.key;
      profile = item.val();
    });

    if (!profileKey || !profile) {
      return res.status(404).send("Invalid tracking link");
    }

    /*
    |--------------------------------------------------------------------------
    | Record click
    |--------------------------------------------------------------------------
    */

    const clickedAt = Date.now();

    await db
      .ref(`profiles/${profileKey}/emailTracking`)
      .update({
        clicked: true,
        clickedAt,
      });

    /*
    |--------------------------------------------------------------------------
    | Redirect user to website
    |--------------------------------------------------------------------------
    */

    const visitUrl =
      `${WEBSITE_URL}?trackingId=${encodeURIComponent(trackingId)}`;

    return res.redirect(302, visitUrl);

  } catch (err) {
    console.error("Click tracking error:", err);

    /*
    | Even if tracking fails, don't leave the user
    | stuck on an error page.
    */

    return res.redirect(302, WEBSITE_URL);
  }
});

/*
|--------------------------------------------------------------------------
| WEBSITE VISIT TRACKING
|--------------------------------------------------------------------------
|
| Your website calls:
|
| GET /track/visit/:trackingId
|
|--------------------------------------------------------------------------
*/

router.get("/track/visit/:trackingId", async (req, res) => {
  try {
    const { trackingId } = req.params;

    const snapshot = await db
      .ref("profiles")
      .orderByChild("trackingId")
      .equalTo(trackingId)
      .once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        message: "Invalid tracking ID",
      });
    }

    let profileKey = null;

    snapshot.forEach((item) => {
      profileKey = item.key;
    });

    if (!profileKey) {
      return res.status(404).json({
        success: false,
        message: "Invalid tracking ID",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Record website visit
    |--------------------------------------------------------------------------
    */

    await db
      .ref(`profiles/${profileKey}/emailTracking`)
      .update({
        visited: true,
        visitedAt: Date.now(),
      });

    /*
    |--------------------------------------------------------------------------
    | Return success
    |--------------------------------------------------------------------------
    */

    return res.json({
      success: true,
      message: "Visit tracked",
    });

  } catch (err) {
    console.error("Visit tracking error:", err);

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router;