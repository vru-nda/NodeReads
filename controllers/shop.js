const fs = require("fs");
const path = require("path");

const PDFDocument = require("pdfkit");
// const stripe = require("stripe")(process.env.STRIPE_S_KEY);
const paypal = require("paypal-rest-sdk");

const Product = require("../models/product");
const Order = require("../models/order");

const ITEMS_PER_PAGE = 3; //items to show on a single page

exports.getIndex = (req, res, next) => {
  //pagination
  const page = +req.query.page || 1;
  let totalItems;

  Product.find()
    .countDocuments()
    .then((numProducts) => {
      totalItems = numProducts;
      return Product.find()
        .skip((page - 1) * ITEMS_PER_PAGE)
        .limit(ITEMS_PER_PAGE);
    })
    .then((products) => {
      res.render("shop/index", {
        prods: products,
        pageTitle: "Shop",
        path: "/",
        currentPage: page,
        hasNextPage: ITEMS_PER_PAGE * page < totalItems,
        hasPreviousPage: page > 1,
        nextPage: page + 1,
        previousPage: page - 1,
        lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE),
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getProducts = (req, res, next) => {
  const page = +req.query.page || 1;
  let totalItems;

  Product.find()
    .countDocuments()
    .then((numProducts) => {
      totalItems = numProducts;
      return Product.find()
        .skip((page - 1) * ITEMS_PER_PAGE)
        .limit(ITEMS_PER_PAGE);
    })
    .then((products) => {
      res.render("shop/product-list", {
        prods: products,
        pageTitle: "Products",
        path: "/products",
        currentPage: page,
        hasNextPage: ITEMS_PER_PAGE * page < totalItems,
        hasPreviousPage: page > 1,
        nextPage: page + 1,
        previousPage: page - 1,
        lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE),
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getProduct = (req, res, next) => {
  const prodId = req.params.productId;
  Product.findById(prodId)
    .then((product) => {
      res.render("shop/product-detail", {
        product: product,
        pageTitle: product.title,
        path: "/products",
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getCart = (req, res, next) => {
  //prepopulating cart with product info
  req.user
    .populate("cart.items.productId")
    .execPopulate()
    .then((user) => {
      const products = user.cart.items;
      res.render("shop/cart", {
        path: "/cart",
        pageTitle: "Your Cart",
        products: products,
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postCart = (req, res, next) => {
  const prodId = req.body.productId;
  Product.findById(prodId)
    .then((product) => {
      return req.user.addToCart(product); //method in model
    })
    .then((result) => {
      res.redirect("/cart");
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postCartDeleteProduct = (req, res, next) => {
  const prodId = req.body.productId;
  req.user
    .removeFromCart(prodId)
    .then((result) => {
      res.redirect("/cart");
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

//checkout ==> GET
exports.getCheckout = (req, res, next) => {
  req.user
    .populate("cart.items.productId")
    .execPopulate()
    .then((user) => {
      const products = user.cart.items;
      let total = 0;
      products.forEach((p) => {
        total += p.quantity * p.productId.price;
      });
      res.render("shop/checkout", {
        path: "/checkout",
        pageTitle: "Checkout",
        products: products,
        totalSum: total,
        paypalClientId: process.env.PAYPAL_CLIENT_ID,
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

// /orders ==> POST
exports.postOrder = (req, res, next) => {
  // Token is created using Checkout or Elements!
  // const token = req.body.stripeToken; // Using Express
  let totalSum = 0;
  req.user
    .populate("cart.items.productId")
    .execPopulate()
    .then((user) => {
      user.cart.items.forEach((p) => {
        totalSum += p.quantity * p.productId.price;
      });

      const products = user.cart.items.map((i) => {
        return {quantity: i.quantity, product: {...i.productId._doc}};
      });

      //creating order
      const order = new Order({
        user: {
          email: req.user.email,
          userId: req.user,
        },
        products: products,
      });
      return order.save();
    })
    .then((result) => {
      const orderItems = req.user.cart.items.map((item) => {
        return {
          name: item.productId.title,
          sku: "item",
          price: item.productId.price,
          currency: "USD",
          quantity: item.quantity,
        };
      });

      const create_payment_json = {
        intent: "sale",
        payer: {
          payment_method: "paypal",
        },
        redirect_urls: {
          return_url: `${process.env.APP_URL}/orders`,
          cancel_url: `${process.env.APP_URL}/cancel`,
        },
        transactions: [
          {
            item_list: {
              items: orderItems,
            },
            amount: {
              currency: "USD",
              total: totalSum,
            },
            description: "Demo order",
          },
        ],
      };

      paypal.payment.create(create_payment_json, function (error, payment) {
        if (error) {
          throw error;
        } else {
          for (let i = 0; i < payment.links.length; i++) {
            if (payment.links[i].rel === "approval_url") {
              req.user.clearCart();
              return res.redirect(payment.links[i].href);
            }
          }
        }
      });
      // const charge = stripe.charges.create({
      //   amount: totalSum * 100,
      //   currency: 'usd',
      //   description: 'Demo Order',
      //   source: token,
      //   metadata: {order_id: result._id.toString()},
      // });
    })
    // .then(() => {
    //   res.redirect("/orders");
    // })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
}; //webhook

exports.getOrders = (req, res, next) => {
  Order.find({"user.userId": req.user._id})
    .then((orders) => {
      res.render("shop/orders", {
        path: "/orders",
        pageTitle: "Your Orders",
        orders: orders,
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getInvoice = (req, res, next) => {
  const orderId = req.params.orderId;
  Order.findById(orderId)
    .then((order) => {
      if (!order) {
        return next(new Error("No order found."));
      }
      //autherization
      if (order.user.userId.toString() !== req.user._id.toString()) {
        return next(new Error("Unauthorized!"));
      }

      const invoiceName = "invoice -" + orderId + ".pdf";
      const invoicePath = path.join("data", "invoices", invoiceName);

      //Dynamically streamimg file
      const pdfDoc = new PDFDocument();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'inline; filename = "' + invoiceName + '"'
      );
      pdfDoc.pipe(fs.createWriteStream(invoicePath));
      pdfDoc.pipe(res);

      //formatting pdf
      pdfDoc.fontSize(20).text("Invoice", {
        underline: false,
        lineBreak: true,
      });
      pdfDoc.text("-----------------------");
      let totalPrice = 0;
      order.products.forEach((prod) => {
        totalPrice += prod.quantity * prod.product.price;
        pdfDoc
          .fontSize(14)
          .text(
            prod.product.title +
              " : " +
              prod.quantity +
              " x " +
              "$" +
              prod.product.price
          );
      });
      pdfDoc.text("------");
      pdfDoc.fontSize(16).text("Total Price: $" + totalPrice);

      pdfDoc.end();

      //serving file
      // fs.readFile(invoicePath, (err, data) => {
      //     if (err) {
      //         return next(err);
      //     }
      //     res.setHeader('Content-Type', 'application/pdf');
      //     res.setHeader('Content-Disposition', 'inline; filename = "' + invoiceName + '"');
      //     res.send(data);
      // });

      // //streaming file
      // const file = fs.createReadStream(invoicePath);
      // res.setHeader('Content-Type', 'application/pdf');
      // res.setHeader('Content-Disposition', 'inline; filename = "' + invoiceName + '"');
      // file.pipe(res);
    })
    .catch((err) => next(err));
};
