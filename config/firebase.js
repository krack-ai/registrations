import { initializeApp, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import fs from "fs";
import path from "path";

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  // Render / Production
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  // Local development
  const serviceAccountPath = path.resolve(
    process.cwd(),
    "serviceAccountKey.json"
  );

  serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf8")
  );
}

const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://registrations-aa57b-default-rtdb.firebaseio.com",
});

const db = getDatabase(app);

export { db };