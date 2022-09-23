const mongoose = require("mongoose");

const OrderSchema = mongoose.Schema({
  id: {
    type: Number,
    require: true,
    unique: true,
  },
  user: {
    type: String,
    require: true,
  },
  amount: {
    type: Number,
    require: true,
  },
  emailorphone: {
    type: String,
    require: true,
    lowercase: true,
  },
  status: {
    type: String,
    require: true,
  },
  value: {
    type: Number,
    require: true,
  },
});

module.exports = mongoose.model("Orders", OrderSchema);
