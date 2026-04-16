const express = require("express");
const MealType = require("../models/MealType");

const router = express.Router();

// GET /api/meal-types - Fetch meal type prices.
router.get("/", async (_req, res) => {
  try {
    const mealTypes = await MealType.find()
      .select("mealPlan mealPlanMr price")
      .sort({ mealPlan: 1 })
      .lean();
    res.json(mealTypes);
  } catch (error) {
    console.error("Get meal types error:", error);
    res.status(500).json({ message: "Failed to fetch meal types" });
  }
});

module.exports = router;
