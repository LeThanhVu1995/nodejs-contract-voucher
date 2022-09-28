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
  process.env.API_VOUCHER ||
  "https://api-admin.shopdi.io/api/v1/bcvouchers/generator";

const API_URL_SIGNATURE =
  process.env.API_URL_SIGNATURE ||
  "https://api-admin.shopdi.io/api/v1/bcvouchers/signature";

const port = process.env.PORT || 8000;
const privateKeyVoucher =
  process.env.PRIVATE_KEY_VOUCHER ||
  "MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGBAISjuQBXkuILZp3/lZjSijEt7LYtIehJ/ZzGcOwkjNbho/+BDuHROQ5oR02s6snMOK6RfaVlbU1zXKx9tRrQgj0gujyGcf3QyiI4TUZBX1aDBx+UAcKDxjVNzURC4SHax3LCDbSZykynTdtGDXO72IY0kl9uhaYunlyY47pe0rM/AgMBAAECgYB+Pnpx+ehCn8lO7pnLN/Dx+B0KFBDmz63EjxehmvQ1/dOi94pbolClBtl+8+sQoQD+Hloxl0UeZ4O4ZXl/iR+7elUMjzKtnI34rpu2eGQcGImB+NemZHDbFMGNKQDjvoVqj7K0kdFIqYVG6kIVUUq/ilFLPR9k3veewKBMUM9T6QJBAOLCzNqdQcNPYeo2OfWQ+6MjfSKyFRhOtsatuk2batB65zM2fHbiBaML/rcnHI+ofElXzmCNHkdUo77dvZvZSlUCQQCVvgyifThTxp00YFnCmKBjAxDJmYVnmHoAq8mxL3v38//VjpSDS9k6sam8N4y0Y65YJcXoxeHqrQmsFyFcgENDAkA0XiZvCkgoscl8DF/gPUZPy59XhubmQS9mvLI8v/qwAOIp6phd4B7LI7cEVyz6ZD+ntHZ9x7lJYdua9ZyXRFwtAkAqPzZdWarcp/qOXmi0qE8H4EOKPVAQDErPiagb32PAbwzM+a8Y4/tjveA/hASkmEMGB5IwvDOi/DLwZI47BMz1AkEAz6TFh53nJHZH6HCbIf+C99x+0GKh1Eb2SQ6H03jIeVLoKH889xE+1RoHZQT7ZFRVq+uaSQHGIt5D2Ho2yNX5tg==";
const publicKeyVoucher =
  process.env.PUBLICKEY_KEY_VOUCHER ||
  "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCEo7kAV5LiC2ad/5WY0ooxLey2LSHoSf2cxnDsJIzW4aP/gQ7h0TkOaEdNrOrJzDiukX2lZW1Nc1ysfbUa0II9ILo8hnH90MoiOE1GQV9WgwcflAHCg8Y1Tc1EQuEh2sdywg20mcpMp03bRg1zu9iGNJJfboWmLp5cmOO6XtKzPwIDAQAB";

let web3 = new Web3(provider);
let myContract = new web3.eth.Contract(abi, address);

const decimal = 1000000000000000000;

app.use(cors({ origin: "*" }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

async function getOrdersPendingStatus() {
  const { PENDING } = PROCESS_STATUS;
  return await ordersModel.find({ status: PENDING });
}

async function createVoucher(params) {
  console.log(params, API_URL_VOUCHER);
  return await axios.post(API_URL_VOUCHER, {
    ...params,
  });
}

const convertToCoin = (coinSHOD) => {
  return Number(coinSHOD);
};

async function paymentSuccess(orderPending) {
  const { SUCCESS } = PROCESS_STATUS;
  const { id, user, amount, value } = orderPending;

  try {
    const {
      accessKey,
      signature,
      status: signatureStatus,
    } = await sinagtureVoucher({
      orderCode: id.toString(),
      amount: convertToCoin(amount / decimal),
      value,
      expiredDate: moment(new Date()).add(1, "years").format("DD/MM/YYYY"),
      phoneOrEmail: orderPending.emailorphone,
    });

    if (signatureStatus) {
      const { status, data } = await createVoucher({
        data: {
          orderCode: id.toString(),
          amount: convertToCoin(amount / decimal),
          value,
          expiredDate: moment(new Date()).add(1, "years").format("DD/MM/YYYY"),
          phoneOrEmail: orderPending.emailorphone,
        },
        publicKey: publicKeyVoucher,
        accessKey,
        signature,
      });
      if (status) {
        await ordersModel.findOneAndUpdate({ id }, { status: SUCCESS });
        io.sockets.emit("payment-success", { ...data, id, user });
      }
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
  console.log(ordersPending);
  if (ordersPending && ordersPending.length) {
    for (const orderPending of ordersPending) {
      const { id } = orderPending;
      const success = await myContract.methods.ids(id).call();
      console.log("success trasaction", success);
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

const sinagtureVoucher = async ({
  orderCode,
  amount,
  value,
  expiredDate,
  phoneOrEmail,
}) => {
  const params = {
    data: {
      orderCode: orderCode.toString(),
      amount,
      value,
      expiredDate,
      phoneOrEmail,
    },
    publicKey: publicKeyVoucher,
  };
  const { data, status } = await axios.post(API_URL_SIGNATURE, params);
  return { ...data.data, status };
};

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
  // var hmac = crypto.createHmac('sha256', 'yoursecretkeyhere');
  // const signature = await sinagtureVoucher({
  //   data: {
  //     orderCode: 20220927180920,
  //     amount: 2,
  //     value: 1000000,
  //     expiredDate: "27/09/2022",
  //     phoneOrEmail: "daucanh2@gmail.com",
  //   },
  //   publicKey:
  //     "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCEo7kAV5LiC2ad/5WY0ooxLey2LSHoSf2cxnDsJIzW4aP/gQ7h0TkOaEdNrOrJzDiukX2lZW1Nc1ysfbUa0II9ILo8hnH90MoiOE1GQV9WgwcflAHCg8Y1Tc1EQuEh2sdywg20mcpMp03bRg1zu9iGNJJfboWmLp5cmOO6XtKzPwIDAQAB",
  // });
  // console.log(signature);
})();
