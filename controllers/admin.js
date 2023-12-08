const {validationResult} = require("express-validator/check");

const fileHelper = require("../util/file");
const Product = require("../models/product");

exports.getAddProduct = (req, res, next) => {
  res.render("admin/edit-product", {
    pageTitle: "Add Product",
    path: "/admin/add-product",
    editing: false,
    hasError: false,
    errorMessage: null,
    validationErrors: [],
  });
};

exports.postAddProduct = (req, res, next) => {
  const title = req.body.title;
  const image = req.file;
  const price = req.body.price;
  const description = req.body.description;

  //validation failed
  if (!image) {
    return res.status(422).render("admin/edit-product", {
      pageTitle: "Add Product",
      path: "/admin/add-product",
      editing: false,
      hasError: true,
      product: {
        title: title,
        price: price,
        description: description,
      },
      errorMessage: "Attached File is not an image",
      validationErrors: [],
    });
  }

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).render("admin/edit-product", {
      pageTitle: "Add Product",
      path: "/admin/add-product",
      editing: false,
      hasError: true,
      product: {
        title: title,
        price: price,
        description: description,
      },
      errorMessage: errors.array()[0].msg,
      validationErrors: errors.array(),
    });
  }

  // // Configuration parameters for the S3 upload
  // const imageName = `${Date.now()}.${image.originalname.split(".").pop()}`;
  // const params = {
  //   Bucket: process.env.AWS_BUCKET_NAME,
  //   Key: imageName,
  //   Body: image.buffer,
  //   ACL: "public-read",
  //   ContentType: image.mimetype,
  // };

  // Upload the image to S3 bucket
  fileHelper
    .uploadImageToS3(image)
    .then((uploadResult) => {
      if (!uploadResult) {
        return res.status(422).render("admin/edit-product", {
          pageTitle: "Add Product",
          path: "/admin/add-product",
          editing: false,
          hasError: true,
          product: {
            title: title,
            price: price,
            description: description,
          },
          errorMessage: "Error uploading the image",
          validationErrors: [],
        });
      }
      const imgUrl = uploadResult.Location;

      //creating a product to DB
      const product = new Product({
        title: title,
        price: price,
        description: description,
        imgUrl: imgUrl,
        userId: req.user,
      });
      return product.save();
    })
    .then((result) => {
      console.log("Created Product");
      res.redirect("/admin/products");
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getEditProduct = (req, res, next) => {
  const editMode = req.query.edit;
  if (!editMode) {
    return res.redirect("/");
  }
  const prodId = req.params.productId;
  Product.findById(prodId)
    .then((product) => {
      if (!product) {
        return res.redirect("/");
      }
      res.render("admin/edit-product", {
        pageTitle: "Edit Product",
        path: "/admin/edit-product",
        editing: editMode,
        product: product,
        hasError: false,
        errorMessage: null,
        validationErrors: [],
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postEditProduct = (req, res, next) => {
  const prodId = req.body.productId;
  const updatedTitle = req.body.title;
  const updatedPrice = req.body.price;
  const image = req.file;
  const updatedDesc = req.body.description;

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).render("admin/edit-product", {
      pageTitle: "Edit Product",
      path: "/admin/edit-product",
      editing: true,
      hasError: true,
      product: {
        title: updatedTitle,
        price: updatedPrice,
        description: updatedDesc,
        _id: prodId,
      },
      errorMessage: errors.array()[0].msg,
      validationErrors: errors.array(),
    });
  }

  let product;
  let oldImageUrl;

  Product.findById(prodId)
    // authorization
    .then((foundProduct) => {
      if (foundProduct.userId.toString() !== req.user._id.toString()) {
        return res.redirect("/");
      }
      product = foundProduct;
      oldImageUrl = product.imgUrl;

      product.title = updatedTitle;
      product.price = updatedPrice;
      product.description = updatedDesc;

      if (image) {
        //deleting image on change

        // Upload the image to S3 bucket
        return fileHelper.uploadImageToS3(image);
      }
    })
    .then((uploadResult) => {
      if (uploadResult) {
        product.imgUrl = uploadResult.Location;
      }
      return product.save();
    })
    .then((result) => {
      // Delete the old image from S3
      if (oldImageUrl) {
        return fileHelper.deleteImageFromS3(oldImageUrl);
      }
    })
    .then((result) => {
      console.log("UPDATED PRODUCT!");
      res.redirect("/admin/products");
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getProducts = (req, res, next) => {
  //authorization
  Product.find({userId: req.user._id})
    // .select('title price -_id')
    // .populate('userId', 'name')
    .then((products) => {
      res.render("admin/products", {
        prods: products,
        pageTitle: "Admin Products",
        path: "/admin/products",
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.deleteProduct = (req, res, next) => {
  const prodId = req.params.productId;

  // Deleting item and file asynchronously
  Product.findById(prodId)
    .then((product) => {
      if (!product) {
        next(new Error("Product not found."));
      }

      return fileHelper.deleteImageFromS3(product.imgUrl).then(() => {
        // Delete the product from the database after deleting the image from S3
        return Product.deleteOne({_id: prodId, userId: req.user._id});
      });
    })
    .then(() => {
      console.log("DESTROYED PRODUCT");
      res.status(200).json({message: "Product successfully deleted!"});
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({message: "Deleting Product failed."});
    });
};
