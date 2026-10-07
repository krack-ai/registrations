import jwt from "jsonwebtoken";

const auth = (req, res, next) => {
    const token = req.header("Authorization");

    if (!token) {
        return res.status(401).json({
            message: "Access Denied",
        });
    }

    try {
        const verified = jwt.verify(
            token.replace("Bearer ", ""),
            process.env.JWT_SECRET
        );

        req.user = verified;

        next();
    } catch (err) {
        return res.status(401).json({
            message: "Invalid Token",
        });
    }
};

export default auth;