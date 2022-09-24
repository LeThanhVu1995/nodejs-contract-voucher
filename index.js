const Web3 = require("web3");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const cron = require("node-cron");
const axios = require("axios");
const moment = require("moment");

const ordersModel = require("./orders.model");

const {
  contract: { address, abi },
} = require("./const");

const app = express();

const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const privateKey =
  process.env.PRIVATE_KEY ||
  "ca78ea20c9390cc35bbe249fe721dcc408f4e72961039e6cb092476e5024c27f";

const provider =
  process.env.PROVIDER || "https://data-seed-prebsc-1-s1.binance.org:8545/";

const connectionString =
  process.env.CONNECTION_STRING ||
  "mongodb+srv://shopdi_bc_test:uABMM3Bywbc1WdM9@shopditestbc.40ennkd.mongodb.net/?retryWrites=true&w=majority";

const PROCESS_STATUS = {
  PENDING: "PENDING",
  SUCCESS: "SUCCESS",
};

const secretKey =
  process.env.SECRETKEY || "6Ldb9_gfAAAAAHlu5NBDdueW-JHSaK7rsGx8XtlE";

const API_URL_VOUCHER =
  process.env.API_VOUCHER || "https://api-admin.shopdi.io/api/v1/bcvouchers";

const port = process.env.PORT || 8000;

let web3 = new Web3(provider);
let myContract = new web3.eth.Contract(abi, address);

app.use(cors({ origin: "*" }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

async function getOrdersPendingStatus() {
  const { PENDING } = PROCESS_STATUS;
  return await ordersModel.find({ status: PENDING });
}

async function createVoucher(params) {
  return await axios.post(API_URL_VOUCHER, {
    ...params,
    expiredDate: moment(new Date()).format("DD/MM/YYYY"),
    phoneOrEmail: params.emailorphone,
  });
}

async function paymentSuccess(orderPending) {
  const { SUCCESS } = PROCESS_STATUS;
  const { id, user } = orderPending;
  try {
    const { status, data } = await createVoucher(orderPending);
    if (status) {
      await ordersModel.findOneAndUpdate({ id }, { status: SUCCESS });

      io.sockets.emit("payment-success", { ...data, id, user });
      console.log("Sending payment success", { ...data, id, user });
    }
  } catch (err) {
    console.error(err);
  }
}

// tạo kết nối giữa client và server
io.on("connection", function (socket) {
  console.log("connected", socket.id);
});

cron.schedule("*/20 * * * * *", async () => {
  const ordersPending = await getOrdersPendingStatus();
  if (ordersPending && ordersPending.length) {
    for (const orderPending of ordersPending) {
      const { id } = orderPending;
      const success = await myContract.methods.ids(id).call();
      if (success) {
        await paymentSuccess(orderPending);
      }
    }
  }
});

app.post("/captcha", async (req, res) => {
  const { captcha } = req.body;

  if (!captcha) {
    res.json({ success: false, message: "captcha token is undefined" });
  }

  const url = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${captcha}`;
  const body = await axios.post(url);
  const { data } = body;

  if (!data.success || data.score < 0.4) {
    return res.status(200).send({
      success: false,
      message: "You might be a robot, sorry!.",
      score: data.score,
    });
  }
  res.status(200).send({ success: true });
});

app.post("/order", async function (req, res) {
  const { user, amount, emailorphone, value } = req.body;
  const id = Number(moment(new Date()).format("YYYYMMDDHHMMss"));

  const orderModel = new ordersModel({
    id,
    user,
    amount,
    value,
    status: PROCESS_STATUS.PENDING,
    emailorphone,
  });

  await orderModel.save();

  const messageHash = await myContract.methods
    .getMessageHash(user, id, amount.toString())
    .call();
  const signature = await web3.eth.accounts.sign(messageHash, privateKey);
  res.status(200).send({ signature, data: { id, amount: amount.toString() } });
});

mongoose
  .connect(connectionString)
  .then((result) => console.log("Database connection success"))
  .catch((err) => console.log("Database connect failed", err));

server.listen(port, function () {
  console.log("Server arealdy started", port);
});

(async () => {
  // const addressERC20 = await myContract.methods.buyToken().call();
  // const signature = await web3.eth.accounts.sign(
  //   {
  //     id: 1,
  //     user: "0x7a3876445a53bdb7b2bac8773badc23e19cd4387",
  //     amount: 500,
  //   },
  //   privateKey
  // );
  // const { message, v, r, s } = signature;
  // const orderModel = new ordersModel({
  //   id: moment(new Date()).format("YYYYMMDDHHmmss"),
  //   user: "0x17cbC2E8A7AdC36e911D560CDcf1577033374A9e",
  //   amount: 100,
  //   value: 50,
  //   status: PROCESS_STATUS.PENDING,
  //   emailorphone: "nguyenvana@gmail.com",
  // });
  // const result = await orderModel.save();
  // const result = await myContract.methods
  //   .buy()
  //   .send({ from: "0x17cbC2E8A7AdC36e911D560CDcf1577033374A9e" });
  // console.log(result);
  // const result = await createVoucher(20220923004509);
  // console.log(result);
  // console.log(addressERC20, signature);
  // const string = [];
  // const messageHash = await myContract.methods
  //   .getMessageHash("0x7a3876445a53bdb7b2bac8773badc23e19cd4387", 1, 500)
  //   .call();
  // console.log(messageHash);
  // const signature = await web3.eth.accounts.sign(messageHash, privateKey);
  // const success = await myContract.methods
  //   .permit(
  //     "0x7a3876445a53bdb7b2bac8773badc23e19cd4387",
  //     1,
  //     500,
  //     signature.v,
  //     signature.r,
  //     signature.s
  //   )
  //   .call();
  // console.log(success);
  // const success = await myContract.methods.ids(1).call();
})();
