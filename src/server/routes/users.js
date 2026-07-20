import express from "express";
import db from "../../database/database.js";

const router = express.Router();

router.get("/api/users", (req, res) => {

    const users = db.prepare(`
        SELECT
            id,
            company_name,
            name,
            jid,
            created_at
        FROM users
    `).all();

    res.json(users);

});

export default router;