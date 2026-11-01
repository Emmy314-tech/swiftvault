import LoginHistory from "../models/LoginHistory.js";

export const getLoginHistory = async (req, res) => {
  try {
    const history = await LoginHistory.find({
      userId: req.user.id,
    }).sort({ createdAt: -1 });

    res.json(history);
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};
