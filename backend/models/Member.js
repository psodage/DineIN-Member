const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema(
  {
    // Authentication is owned by User; Member links to that auth record.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // Hosteler personal details
    name: { type: String, required: true, trim: true },
    // Marathi display name (optional for backwards compatibility)
    nameMr: { type: String, trim: true, default: "" },
    rollNumber: { type: String, required: true, trim: true },
    roomOwnerName: { type: String, required: true, trim: true },
    // Marathi room owner name (optional for backwards compatibility)
    roomOwnerNameMr: { type: String, trim: true, default: "" },
    phone: { type: String, required: true, trim: true },

    joiningDate: { type: Date, default: Date.now },

    // Hostel status / meal plan (English enums for logic; *Mr for display)
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    statusMr: { type: String, trim: true, default: "" },
    mealPlan: { type: String, enum: ["Lunch", "Dinner", "Both"], default: "Lunch" },
    mealPlanMr: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

// Explicitly store in "members" collection.
module.exports = mongoose.model("Member", memberSchema, "members");

