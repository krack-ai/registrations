import { initializeApp, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import fs from "fs";
import path from "path";

let serviceAccount;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log("Using Firebase service account from environment");

    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    console.log("Using local serviceAccountKey.json");

    const serviceAccountPath = path.resolve(
      process.cwd(),
      "serviceAccountKey.json"
    );

    serviceAccount = JSON.parse(
      fs.readFileSync(serviceAccountPath, "utf8")
    );
  }

  console.log("Firebase project:", serviceAccount.project_id);
  console.log("Firebase client email:", serviceAccount.client_email);

} catch (error) {
  console.error("Failed to load Firebase credentials:", error);
  throw error;
}

const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://registrations-aa57b-default-rtdb.firebaseio.com",
});

const db = getDatabase(app);

console.log("Firebase initialized successfully");

export { db };