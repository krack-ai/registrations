import { initializeApp, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import serviceAccount from "../serviceAccountKey.json" with { type: "json" };

const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://registrations-aa57b-default-rtdb.firebaseio.com",
});

const db = getDatabase(app);

export {db};