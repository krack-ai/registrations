
import express from "express";
import { db } from "../config/firebase.js";
import auth from "../middleware/auth.js";
import { Resend } from "resend";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

const BACKEND_URL = (
  process.env.BACKEND_URL || "http://localhost:5000"
).replace(/\/$/, "");

const WEBSITE_URL =
  process.env.WEBSITE_URL || "https://www.krack-ai.com";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getEmailKey(email) {
  return crypto
    .createHash("sha256")
    .update(normalizeEmail(email))
    .digest("hex");
}

function getDateKey(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/*
|--------------------------------------------------------------------------
| STATS
|--------------------------------------------------------------------------
| Reads aggregate counts from:
| profileStats/{submitterHash}/{YYYY-MM-DD}
*/

router.post("/stats", auth, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const submitterKey = getEmailKey(email);

    const snapshot = await db
      .ref(`profileStats/${submitterKey}`)
      .once("value");

    const counts = snapshot.val() || {};
    let totalCount = 0;

    const dailyStats = Object.entries(counts)
      .map(([date, value]) => {
        const count = Number(value) || 0;
        totalCount += count;
        return { date, count };
      })
      .filter((item) => item.count > 0)
      .sort((a, b) => b.date.localeCompare(a.date));

    return res.json({
      success: true,
      submittedUser: email,
      totalCount,
      dailyStats,
    });
  } catch (error) {
    console.error("Stats error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch stats",
    });
  }
});

/*
|--------------------------------------------------------------------------
| SUBMIT PROFILE
|--------------------------------------------------------------------------
*/

router.post("/submit", auth, async (req, res) => {
  let emailKey;
  let reservationId;
  let reservationClaimed = false;
  let profileSaved = false;

  try {
    const {
      fullName = "",
      email: rawEmail,
      phone = "",
      techStack = "",
      submittedUser: rawSubmittedUser,
    } = req.body || {};

    const email = normalizeEmail(rawEmail);
    const submittedUser = normalizeEmail(rawSubmittedUser);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email",
      });
    }

    if (!submittedUser) {
      return res.status(400).json({
        success: false,
        message: "Submitter email is required",
      });
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "Email service is not configured",
      });
    }

    emailKey = getEmailKey(email);
    reservationId = crypto.randomUUID();

    const lookupRef = db.ref(`emailLookup/${emailKey}`);

    // Atomically reserve the email to prevent simultaneous duplicates.
    const reservation = await lookupRef.transaction((current) => {
      if (current !== null) {
        return; // Abort: email already exists or is reserved.
      }

      return {
        status: "pending",
        reservationId,
        email,
        createdAt: Date.now(),
      };
    });

    if (!reservation.committed) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    reservationClaimed = true;

    const profileRef = db.ref("profiles").push();
    const trackingId = crypto.randomUUID();
    const createdAt = Date.now();

    const profile = {
      userId: req.user?.userId || null,
      fullName: String(fullName).trim(),
      email,
      phone: String(phone).trim(),
      techStack: String(techStack).trim(),
      createdAt,
      submittedUser,
      trackingId,
      emailTracking: {
        clicked: false,
        clickedAt: null,
        visited: false,
        visitedAt: null,
      },
    };

    // Save the profile and lookup entry together.
    await db.ref().update({
      [`profiles/${profileRef.key}`]: profile,
      [`emailLookup/${emailKey}`]: {
        profileId: profileRef.key,
        email,
      },
    });

    profileSaved = true;
    reservationClaimed = false;

    // Update daily stats.
    const submitterKey = getEmailKey(submittedUser);
    const dateKey = getDateKey(createdAt);

    try {
      await db
        .ref(`profileStats/${submitterKey}/${dateKey}`)
        .transaction((current) => (Number(current) || 0) + 1);

      // Maintain the unique submitter list for /admin/users.
      await db.ref(`submitters/${submitterKey}`).transaction(
        (current) => current || { email: submittedUser }
      );
    } catch (aggregateError) {
      console.error(
        "Profile saved, but stats/submitter update failed:",
        aggregateError
      );
    }

    const trackingUrl =
      `${BACKEND_URL}/api/profile/track/click/${trackingId}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <body style="margin:0;padding:30px;background:#f4f7fb;font-family:Arial,sans-serif;color:#1f2937">
        <div style="max-width:600px;margin:auto;background:white;padding:30px;border-radius:14px">
          <h1 style="color:#4f46e5">🎉 Congratulations!</h1>
          <p>Hi <strong>${escapeHtml(fullName || "there")}</strong>,</p>
          <p>We're excited to congratulate you on your selection!</p>
          <p>We wish you tremendous success as you begin this exciting journey.</p>
          <div style="padding:20px;background:#f8fafc;border-radius:10px">
            <p style="color:#6366f1;font-weight:bold">YOUR TECH STACK</p>
            <h2>${escapeHtml(techStack || "Technology")}</h2>
          </div>
          <p>Meet <strong>Krack-AI</strong>, your AI-powered interview practice assistant.</p>
          <p style="text-align:center;margin:30px">
            <a href="${escapeHtml(trackingUrl)}"
               style="display:inline-block;padding:15px 28px;background:#4f46e5;color:white;text-decoration:none;border-radius:8px;font-weight:bold">
              Explore Krack-AI →
            </a>
          </p>
          <p>Best wishes,<br><strong>Team Krack-AI</strong></p>
        </div>
      </body>
      </html>
    `;

    // Profile is already saved. Email failure won't create duplicate profiles.
    let emailSent = false;

    try {
      const result = await resend.emails.send({
        from: "Krack-AI <promotions@mail.krack-ai.com>",
        to: email,
        subject: "🎉 Congratulations on Your Selection!",
        html,
      });

      if (result?.error) {
        console.error("Resend error:", result.error);
      } else {
        emailSent = true;
      }
    } catch (emailError) {
      console.error("Email send error:", emailError);
    }

    return res.status(201).json({
      success: true,
      message: emailSent
        ? "Profile submitted successfully"
        : "Profile saved, but email could not be sent",
      emailSent,
    });
  } catch (error) {
    console.error("Submit error:", error);

    // Release only our own reservation if no profile was saved.
    if (reservationClaimed && !profileSaved && emailKey && reservationId) {
      try {
        await db.ref(`emailLookup/${emailKey}`).transaction((current) => {
          if (
            current?.status === "pending" &&
            current?.reservationId === reservationId
          ) {
            return null;
          }

          return current;
        });
      } catch (cleanupError) {
        console.error("Reservation cleanup error:", cleanupError);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Unable to submit profile",
    });
  }
});


/*
|--------------------------------------------------------------------------
| EMAIL CLICK TRACKING
|--------------------------------------------------------------------------
| GET /api/profile/track/click/:trackingId
| Records the click and redirects to the website.
*/

router.get("/track/click/:trackingId", async (req, res) => {
  try {
    const { trackingId } = req.params;

    if (!trackingId) {
      return res.status(400).send("Tracking ID is required");
    }

    const snapshot = await db
      .ref("profiles")
      .orderByChild("trackingId")
      .equalTo(trackingId)
      .limitToFirst(1)
      .once("value");

    if (!snapshot.exists()) {
      return res.status(404).send("Invalid tracking link");
    }

    let profileKey = null;

    snapshot.forEach((item) => {
      profileKey = item.key;
    });

    if (!profileKey) {
      return res.status(404).send("Invalid tracking link");
    }

    await db
      .ref(`profiles/${profileKey}/emailTracking`)
      .update({
        clicked: true,
        clickedAt: Date.now(),
      });

    const redirectUrl =
      `${WEBSITE_URL}?trackingId=${encodeURIComponent(trackingId)}`;

    return res.redirect(302, redirectUrl);
  } catch (error) {
    console.error("Click tracking error:", error);

    // Keep the recipient from getting stuck on a tracking error.
    return res.redirect(302, WEBSITE_URL);
  }
});

/*
|--------------------------------------------------------------------------
| WEBSITE VISIT TRACKING
|--------------------------------------------------------------------------
| GET /api/profile/track/visit/:trackingId
| Call this endpoint from your website when the tracking URL is opened.
*/

router.get("/track/visit/:trackingId", async (req, res) => {
  try {
    const { trackingId } = req.params;

    if (!trackingId) {
      return res.status(400).json({
        success: false,
        message: "Tracking ID is required",
      });
    }

    const snapshot = await db
      .ref("profiles")
      .orderByChild("trackingId")
      .equalTo(trackingId)
      .limitToFirst(1)
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

    await db
      .ref(`profiles/${profileKey}/emailTracking`)
      .update({
        visited: true,
        visitedAt: Date.now(),
      });

    return res.json({
      success: true,
      message: "Visit tracked",
    });
  } catch (error) {
    console.error("Visit tracking error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to track visit",
    });
  }
});

/*
|--------------------------------------------------------------------------
| ADMIN USERS
|--------------------------------------------------------------------------
| GET /api/profile/admin/users
| Returns unique submitter emails for the dropdown.
*/

router.get("/admin/users", auth, async (req, res) => {
  try {
    const snapshot = await db
      .ref("submitters")
      .once("value");

    const users = [];

    snapshot.forEach((item) => {
      const email = item.val()?.email;

      if (email) {
        users.push(email);
      }
    });

    return res.json({
      success: true,
      users: [...new Set(users)].sort(),
    });
  } catch (error) {
    console.error("Fetch submitters error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch submitters",
    });
  }
});


/*
|--------------------------------------------------------------------------
| ADMIN ALL PROFILES — PAGINATION
|--------------------------------------------------------------------------
| First page:
| GET /api/profile/admin/all?limit=50
|
| Next page:
| GET /api/profile/admin/all?limit=50&cursorCreatedAt=TIMESTAMP&cursorId=PROFILE_ID
*/

router.get("/admin/all", auth, async (req, res) => {
  try {
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Math.min(
      100,
      Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 50)
    );

    const cursorCreatedAt = req.query.cursorCreatedAt;
    const cursorId = req.query.cursorId;

    // Both cursor values must be supplied together.
    if (
      (cursorCreatedAt !== undefined) !==
      (cursorId !== undefined)
    ) {
      return res.status(400).json({
        success: false,
        message: "Both cursorCreatedAt and cursorId are required",
      });
    }

    let query = db
      .ref("profiles")
      .orderByChild("createdAt");

    if (cursorCreatedAt !== undefined) {
      const timestamp = Number(cursorCreatedAt);
      const id = String(cursorId || "");

      if (!Number.isFinite(timestamp) || !id) {
        return res.status(400).json({
          success: false,
          message: "Invalid pagination cursor",
        });
      }

      // Include the cursor item so we can remove it after reading.
      query = query.endAt(timestamp, id);
    }

    // Fetch only a bounded set of records.
    const snapshot = await query
      .limitToLast(
        cursorCreatedAt !== undefined
          ? limit + 1
          : limit + 1
      )
      .once("value");

    let rows = [];

    snapshot.forEach((item) => {
      rows.push({
        id: item.key,
        ...(item.val() || {}),
      });
    });

    // Firebase's query order is oldest to newest.
    rows.reverse();

    // Remove the previous page's cursor record.
    if (cursorId !== undefined) {
      rows = rows.filter(
        (profile) => profile.id !== String(cursorId)
      );
    }

    const hasNextPage = rows.length > limit;
    const pageRows = rows.slice(0, limit);

    const profiles = pageRows.map((profile) => {
      const tracking = profile.emailTracking || {};

      return {
        id: profile.id,
        fullName: profile.fullName || "",
        email: profile.email || "",
        phone: profile.phone || "",
        techStack: profile.techStack || "",
        submittedUser: profile.submittedUser || "",
        createdAt: profile.createdAt || null,
        clicked: tracking.clicked === true,
        clickedAt: tracking.clickedAt || null,
        visited: tracking.visited === true,
        visitedAt: tracking.visitedAt || null,
        trackingId: profile.trackingId || "",
      };
    });

    // For newest-first pages, use the oldest returned item as
    // the cursor for the next page.
    const lastProfile = pageRows[pageRows.length - 1];

    return res.json({
      success: true,
      limit,
      hasNextPage,
      nextCursor:
        hasNextPage && lastProfile
          ? {
              createdAt: lastProfile.createdAt,
              id: lastProfile.id,
            }
          : null,
      profiles,
    });
  } catch (error) {
    console.error("Fetch profiles error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch profiles",
    });
  }
});


/*
|--------------------------------------------------------------------------
| ADMIN DASHBOARD STATS
|--------------------------------------------------------------------------
| GET /api/profile/admin/stats
| POST /api/profile/admin/stats/refresh
|
| GET returns the most recently saved stats.
| POST refreshes stats, subject to a 90-minute cooldown.
*/

const STATS_REFRESH_COOLDOWN = 90 * 60 * 1000;

router.get("/admin/stats", auth, async (req, res) => {
  res.set("Cache-Control", "no-store");
res.set("Pragma", "no-cache");
  try {
    const snapshot = await db
      .ref("adminSettings/profileDashboardStats")
      .once("value");

    const savedStats = snapshot.val();

    if (!savedStats) {
      return res.json({
        success: true,
        stats: null,
        lastRefreshedAt: null,
        refreshAvailable: true,
        message: "Refresh stats to load the latest counts",
      });
    }

    const lastRefreshedAt = Number(savedStats.lastRefreshedAt) || null;
    const remainingMs = lastRefreshedAt
      ? Math.max(
          0,
          STATS_REFRESH_COOLDOWN - (Date.now() - lastRefreshedAt)
        )
      : 0;

    return res.json({
      success: true,
      stats: savedStats.stats || null,
      lastRefreshedAt,
      refreshAvailable: remainingMs === 0,
      remainingMs,
    });
  } catch (error) {
    console.error("Dashboard stats read error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch dashboard stats",
    });
  }
});


router.post("/admin/stats/refresh", auth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");

  const statsRef = db.ref("adminSettings/profileDashboardStats");
  const lockRef = db.ref("adminSettings/profileDashboardStatsRefreshLock");
  const now = Date.now();
  const lockId = crypto.randomUUID();

  try {
    // Claim the lock atomically. The lock has a 10-minute expiry.
    const lockTransaction = await lockRef.transaction((current) => {
      const lockTime = Number(current?.lockedAt) || 0;
      const lockIsActive =
        current?.lockId &&
        now - lockTime < 10 * 60 * 1000;

      if (lockIsActive) return;

      return {
        lockId,
        lockedAt: now,
      };
    });

    if (!lockTransaction.committed) {
      return res.status(409).json({
        success: false,
        message: "A statistics refresh is already in progress. Try again shortly.",
      });
    }

    // Enforce the 90-minute cooldown using saved statistics.
    const savedSnapshot = await statsRef.once("value");
    const saved = savedSnapshot.val() || {};
    const lastRefreshedAt = Number(saved.lastRefreshedAt) || 0;
    const elapsed = Date.now() - lastRefreshedAt;

    if (lastRefreshedAt && elapsed < STATS_REFRESH_COOLDOWN) {
      // Release only the lock owned by this request.
      await lockRef.transaction((current) => {
        if (current?.lockId !== lockId) return;
        return null;
      });

      return res.status(429).json({
        success: false,
        message: "Stats can only be refreshed every 90 minutes.",
        lastRefreshedAt,
        remainingMs: Math.max(0, STATS_REFRESH_COOLDOWN - elapsed),
      });
    }

    // Count all profiles.
    const profilesSnapshot = await db.ref("profiles").once("value");

    let totalUsers = 0;
    let clickedUsers = 0;

    profilesSnapshot.forEach((child) => {
      const profile = child.val();
      if (!profile) return;

      totalUsers += 1;

      if (
        profile.emailTracking?.clicked === true ||
        profile.clicked === true
      ) {
        clickedUsers += 1;
      }
    });

    const completedAt = Date.now();

    const stats = {
      totalUsers,
      clickedUsers,
      notClickedUsers: totalUsers - clickedUsers,
      clickRate: totalUsers
        ? Number(((clickedUsers / totalUsers) * 100).toFixed(2))
        : 0,
    };

    // Verify lock ownership before saving.
    const currentLock = (await lockRef.once("value")).val();

    if (currentLock?.lockId !== lockId) {
      return res.status(409).json({
        success: false,
        message: "Refresh lock expired or was replaced. Please try again.",
      });
    }

    // Save the aggregate stats without storing lock fields in this node.
    await statsRef.update({
      stats,
      lastRefreshedAt: completedAt,
    });

    // Release our lock only.
    await lockRef.transaction((current) => {
      if (current?.lockId !== lockId) return;
      return null;
    });

    return res.json({
      success: true,
      stats,
      lastRefreshedAt: completedAt,
      refreshAvailable: false,
      remainingMs: STATS_REFRESH_COOLDOWN,
    });
  } catch (error) {
    console.error("Dashboard stats refresh error:", error);

    // Never release a lock belonging to a different request.
    try {
      await lockRef.transaction((current) => {
        if (current?.lockId !== lockId) return;
        return null;
      });
    } catch (cleanupError) {
      console.error("Stats refresh lock cleanup error:", cleanupError);
    }

    return res.status(500).json({
      success: false,
      message: "Unable to refresh dashboard stats.",
    });
  }
});



export default router;
