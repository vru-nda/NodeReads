const mongoose = require('mongoose');
const fileHelper = require('../util/file');

const { validationResult } = require('express-validator/check');

const Product = require('../models/product');

exports.getAddProduct = (req, res, next) => {
    res.render('admin/edit-product', {
        pageTitle: 'Add Product',
        path: '/admin/add-product',
        editing: false,
        hasError: false,
        errorMessage: null,
        validationErrors: []
    });
};

exports.postAddProduct = (req, res, next) => {
    const title = req.body.title;
    // const imgUrl = req.body.imgUrl;
    const image = req.file;
    const price = req.body.price;
    const description = req.body.description;
    //validation failed
    if (!image) {
        return res.status(422).render('admin/edit-product', {
            pageTitle: 'Add Product',
            path: '/admin/add-product',
            editing: false,
            hasError: true,
            product: {
                title: title,
                price: price,
                description: description
            },
            errorMessage: 'Attached File is not an image',
            validationErrors: []
        });
    }
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        console.log(errors.array());
        return res.status(422).render('admin/edit-product', {
            pageTitle: 'Add Product',
            path: '/admin/add-product',
            editing: false,
            hasError: true,
            product: {
                title: title,
                price: price,
                description: description
            },
            errorMessage: errors.array()[0].msg,
            validationErrors: errors.array()
        });
    }

    //creating a product to DB
    const imgUrl = image.path;
    const product = new Product({
        title: title,
        price: price,
        description: description,
        imgUrl: imgUrl,
        userId: req.user
    });
    product
        .save()
        .then(result => {
            console.log('Created Product');
            res.redirect('/admin/products');
        })
        .catch(err => {
            // return res.status(500).render('admin/edit-product', {
            //   pageTitle: 'Add Product',
            //   path: '/admin/add-product',
            //   editing: false,
            //   hasError: true,
            //   product: {
            //     title: title,
            //     imgUrl: imgUrl,
            //     price: price,
            //     description: description
            //   },
            //   errorMessage: 'Database operation failed, please try again.',
            //   validationErrors: []
            // });
            // res.redirect('/500');
            const error = new Error(err);
            error.httpStatusCode = 500;
            return next(error);
        });
};

exports.getEditProduct = (req, res, next) => {
    const editMode = req.query.edit;
    if (!editMode) {
        return res.redirect('/');
    }
    const prodId = req.params.productId;
    Product.findById(prodId)
        .then(product => {
            if (!product) {
                return res.redirect('/');
            }
            res.render('admin/edit-product', {
                pageTitle: 'Edit Product',
                path: '/admin/edit-product',
                editing: editMode,
                product: product,
                hasError: false,
                errorMessage: null,
                validationErrors: []
            });
        })
        .catch(err => {
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
        return res.status(422)
            .render('admin/edit-product', {
                pageTitle: 'Edit Product',
                path: '/admin/edit-product',
                editing: true,
                hasError: true,
                product: {
                    title: updatedTitle,
                    price: updatedPrice,
                    description: updatedDesc,
                    _id: prodId
                },
                errorMessage: errors.array()[0].msg,
                validationErrors: errors.array()
            });
    }

    Product.findById(prodId)
        // authorization
        .then(product => {
            if (product.userId.toString() !== req.user._id.toString()) {
                return res.redirect('/');
            }
            product.title = updatedTitle;
            product.price = updatedPrice;
            product.description = updatedDesc;
            //deleting image on change
            if (image) {
                fileHelper.deleteFile(product.imgUrl);
                product.imgUrl = image.path;
            }
            return product.save().then(result => {
                console.log('UPDATED PRODUCT!');
                res.redirect('/admin/products');
            });
        })
        .catch(err => {
            const error = new Error(err);
            error.httpStatusCode = 500;
            return next(error);
        });
};

exports.getProducts = (req, res, next) => {
    //authorization
    Product.find({ userId: req.user._id })
        // .select('title price -_id')
        // .populate('userId', 'name')
        .then(products => {
            res.render('admin/products', {
                prods: products,
                pageTitle: 'Admin Products',
                path: '/admin/products'
            });
        })
        .catch(err => {
            const error = new Error(err);
            error.httpStatusCode = 500;
            return next(error);
        });
};

exports.deleteProduct = (req, res, next) => {
    const prodId = req.params.productId;

    //deleting item and file Asynchronously
    Product.findById(prodId)
        .then(product => {
            if (!product) {
                next(new Error('Product not found.'));
            }
            fileHelper.deleteFile(product.imgUrl);
            return Product.deleteOne({ _id: prodId, userId: req.user._id })

        })
        .then(() => {
            console.log('DESTROYED PRODUCT');
            res.status(200).json({ message: 'Product successfully deleted!' });
        })
        .catch(err => {
            res.status(500).json({ message: 'Deleting Product failed.' });
        });
};