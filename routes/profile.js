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
      subject: "🎉 Congratulations on Your Selection!",

html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Congratulations on Your Selection</title>
</head>

<body
  style="
    margin: 0;
    padding: 0;
    background-color: #f4f7fb;
    font-family: Arial, Helvetica, sans-serif;
    color: #1f2937;
  "
>

  <table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    style="background-color: #f4f7fb; padding: 40px 15px;"
  >
    <tr>
      <td align="center">

        <!-- Main Container -->
        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="
            max-width: 620px;
            background-color: #ffffff;
            border-radius: 18px;
            overflow: hidden;
            box-shadow: 0 8px 30px rgba(0,0,0,0.08);
          "
        >

          <!-- Header -->
          <tr>
            <td
              align="center"
              style="
                padding: 42px 30px;
                background: linear-gradient(135deg, #111827, #312e81);
              "
            >

              <div
                style="
                  display: inline-block;
                  width: 64px;
                  height: 64px;
                  line-height: 64px;
                  background-color: rgba(255,255,255,0.15);
                  border-radius: 50%;
                  font-size: 32px;
                  margin-bottom: 18px;
                "
              >
                🎉
              </div>

              <h1
                style="
                  margin: 0;
                  color: #ffffff;
                  font-size: 30px;
                  line-height: 1.2;
                  font-weight: 700;
                "
              >
                Congratulations!
              </h1>

              <p
                style="
                  margin: 12px 0 0;
                  color: #dbeafe;
                  font-size: 16px;
                  line-height: 1.5;
                "
              >
                Your next chapter starts here.
              </p>

            </td>
          </tr>


          <!-- Content -->
          <tr>
            <td style="padding: 40px 40px 20px;">

              <p
                style="
                  margin: 0 0 20px;
                  font-size: 18px;
                  color: #111827;
                "
              >
                Hi <strong>${fullName || "there"}</strong>,
              </p>

              <p
                style="
                  margin: 0 0 20px;
                  font-size: 16px;
                  line-height: 1.7;
                  color: #4b5563;
                "
              >
                We're excited to congratulate you on your
                <strong style="color: #111827;">
                  selection!
                </strong>
                🎊
              </p>

              <p
                style="
                  margin: 0 0 28px;
                  font-size: 16px;
                  line-height: 1.7;
                  color: #4b5563;
                "
              >
                This is a fantastic achievement, and we wish you
                tremendous success as you begin this exciting new
                journey. Keep learning, keep growing, and keep
                building great things.
              </p>


              <!-- Highlight Card -->
              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  background-color: #f8fafc;
                  border: 1px solid #e5e7eb;
                  border-radius: 14px;
                  margin-bottom: 28px;
                "
              >
                <tr>
                  <td style="padding: 24px;">

                    <p
                      style="
                        margin: 0 0 8px;
                        font-size: 13px;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                        color: #6366f1;
                        font-weight: 700;
                      "
                    >
                      Your Tech Stack
                    </p>

                    <p
                      style="
                        margin: 0;
                        font-size: 22px;
                        font-weight: 700;
                        color: #111827;
                      "
                    >
                      ${techStack || "Technology"}
                    </p>

                  </td>
                </tr>
              </table>


              <p
                style="
                  margin: 0 0 18px;
                  font-size: 16px;
                  line-height: 1.7;
                  color: #4b5563;
                "
              >
                Preparing for your next interview or looking to
                sharpen your interview skills?
              </p>

              <p
                style="
                  margin: 0 0 28px;
                  font-size: 16px;
                  line-height: 1.7;
                  color: #4b5563;
                "
              >
                Meet <strong style="color: #111827;">Krack-AI</strong> —
                an AI-powered interview assistant designed to help
                you practice, improve your answers, and walk into
                your next interview with greater confidence.
              </p>


              <!-- CTA -->
              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="margin-bottom: 30px;"
              >
                <tr>
                  <td align="center">

                    <a
                      href="${trackingUrl}"
                      target="_blank"
                      rel="noopener noreferrer"
                      style="
                        display: inline-block;
                        padding: 15px 34px;
                        background-color: #4f46e5;
                        color: #ffffff;
                        text-decoration: none;
                        border-radius: 10px;
                        font-size: 16px;
                        font-weight: 700;
                        letter-spacing: 0.2px;
                      "
                    >
                      Explore Krack-AI →
                    </a>

                  </td>
                </tr>
              </table>


              <p
                style="
                  margin: 0 0 10px;
                  text-align: center;
                  font-size: 13px;
                  color: #9ca3af;
                "
              >
                Your next interview could be your best one yet.
              </p>

            </td>
          </tr>


          <!-- Footer -->
          <tr>
            <td
              align="center"
              style="
                padding: 25px 30px;
                background-color: #f8fafc;
                border-top: 1px solid #eef2f7;
              "
            >

              <p
                style="
                  margin: 0 0 6px;
                  font-size: 14px;
                  color: #6b7280;
                "
              >
                Best wishes,
              </p>

              <p
                style="
                  margin: 0;
                  font-size: 15px;
                  font-weight: 700;
                  color: #111827;
                "
              >
                Team Krack-AI
              </p>

              <p
                style="
                  margin: 12px 0 0;
                  font-size: 12px;
                  color: #9ca3af;
                "
              >
                AI-powered interview preparation
              </p>

            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
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