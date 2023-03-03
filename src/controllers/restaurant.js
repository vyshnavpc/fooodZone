const restaurant = require("../models/restaurant")
const bcrypt = require('bcrypt')

const sendOtpViaMail = require("../helpers/sendOtpMail");
const generateRestaurantOtp = require("../helpers/generatOtpRestaurant");
const fs = require('fs');
const user = require("./user");
const category = require("../models/category");
const { dataUri } = require("../helpers/imagepload");
const { uploader } = require("../config/cloudinary");
const { default: mongoose } = require("mongoose");
const order = require("../models/order");
const service = require("./service");
// const { promisfy } = require('util')
// const unlinkAsync = promisfy(fs.unlink)
module.exports = {
    viewProductsGet: (req, res, next) => {
        restaurant.aggregate([
            { $match: { _id: mongoose.Types.ObjectId(req.session.restaurant.restaurantId) } },
            { $unwind: "$menu" }, {
                $lookup: {
                    from: 'categories',
                    localField: "menu.category",
                    foreignField: "_id",
                    as: "category"
                }
            },
            { $unwind: "$category" },
            {
                $project: {
                    menu: 1,
                    category: 1
                }
            }
        ]).then((dishes) => {
            res.render("restaurant/products", { restaurantHeader: true, title: "orders", cart: sample, restaurant: true, products: dishes })
        }).catch((err) => {
            next(err)
        })
    }

    ,
    OtpVerificationPost: async (req, res, next) => {
        try {
            restaurant.findById({ _id: req.params.restaurant_id }).then((restaurantData) => {
                let expired = new Date(restaurantData.otp.expiredAt)
                let currentDate = new Date();
                if (req.params.validation_type === "2-factor") {
                    bcrypt.compare(req.body.otp, restaurantData.otp.otp).then((status) => {

                        if (status && expired > currentDate) {
                            restaurant.findByIdAndUpdate({ _id: restaurantData._id }, { $set: { "otp.otp": "" } }, { new: true }).then((restaurantnew) => {
                                req.session.restaurant = {
                                    restaurantId: restaurantnew._id,
                                    restaurantEmail: restaurantnew.email,
                                    verified: restaurantnew.verified,
                                    profile_verified: restaurantnew.profile_completed
                                }
                                res.redirect('/restaurant/view-orders')

                            }).catch(() => {
                                req.session.err = "otp validation error"
                                res.redirect(`/restaurant/${req.params.restaurant_id}/validate-otp/2-factor`)
                            })
                        } else {
                            req.session.err = "otp validation error"
                            res.redirect(`/restaurant/${req.params.restaurant_id}/validate-otp/2-factor`)
                        }
                    })
                } else {
                    bcrypt.compare(req.body.otp, restaurantData.otp.otp).then((status) => {
                        if (status && expired > currentDate) {
                            restaurant.findByIdAndUpdate({ _id: restaurantData._id }, { $set: { "verified": true, "otp.otp": "" } }, { new: true }).then((restaurantnew) => {
                                res.redirect('/restaurant/view-orders')
                            })
                        } else {
                            req.session.err = "otp validation error"
                            res.redirect(`/restaurant/${req.params.restaurant_id}/validate-otp/verify-profile`)
                        }
                    })
                }
            })
        } catch (err) {
            next(err)
        }
    }
    ,
    viewOrdersGet: (req, res, next) => {
        order.aggregate([{
            $match: {
                restaurant_id: mongoose.Types.ObjectId(req.session.restaurant.restaurantId)
            }
        }, {
            $lookup: {
                from: 'users',
                localField: "user_id",
                foreignField: "_id",
                as: "user"
            },
        }, {
            $unwind: "$user"
        }, {
            $lookup: {
                from: 'restaurants',
                localField: "restaurant_id",
                foreignField: "_id",
                as: "restaurant"
            }
        }, {
            $unwind: "$restaurant"
        }]).then((orders) => {
            let data = orders
            let products = []
            orders.map((order, index) => {
                order.products.map((product, index) => {
                    order.restaurant.menu.map((dish) => {
                        if (String(dish._id) === String(product.product_id)) {
                            products.push({ ...dish, quantity: product.quantity })
                        }
                    })
                })
                data[index].menu = products
                data[index].date = new Date(data[index].date).toDateString()
                products = []
            })
            res.render("restaurant/orders", { restaurantHeader: true, restaurant: true, orders: { ...orders, ...products } })
        }).catch((err) => [
            next(err)
        ])
    },
    approveOrderPost: (req, res, next) => {
        order.findByIdAndUpdate({
            _id: req.params.order_id
        }, {
            $set: {
                status: "approved"
            }
        }).then((order) => res.json(order)).catch((err) => {
            next(err)
        })
    },
    cancelOrderPost: (req, res, next) => {
        order.findByIdAndUpdate({
            _id: req.params.order_id
        }, {
            $set: {
                status: "canceled"
            }
        }).then((order) => res.json(order)).catch((err) => next(err))
    },
    showProfileGet: (req, res, next) => {
        restaurant.findById({ _id: req.session.restaurant.restaurantId }).then((restaurantData) => {
            const data = {
                restaurantHeader: true,
                restaurant: restaurantData,
                err: req.session?.err
            }
            req.session.err = null
            res.render("restaurant/profile", data)
        }).catch((err) => {
            next(err)
        })
    },
    tableManagementGet: (req, res, next) => {
        restaurant.findById({ _id: req.session.restaurant.restaurantId }, { tables: 1 }).then((tables) => {
            const data = {
                restaurantHeader: true,
                tables: tables.tables,
                err: req.session?.err
            }
            req.session.err = null
            res.render("restaurant/tables", data)
        }).catch((err) => next(err))
    },
    saveProfilePost: (req, res, next) => {
        const { password, ...rest } = req.body
        try {
            restaurant.findById({ _id: req.session.restaurant.restaurantId }).then((restaurantData) => {
                bcrypt.compare(password, restaurantData.password).then(async (status) => {
                    if (status) {
                        let image = []
                        if (req.files) {

                            const file1 = await dataUri(req.files[0]).content
                            const file2 = await dataUri(req.files[1]).content
                            const file3 = await dataUri(req.files[2]).content
                            const file4 = await dataUri(req.files[3]).content
                            const image1 = await uploader.upload(file1, {
                                transformation: [
                                    { width: 400, height: 300, crop: "fill" },
                                ]
                            })
                            const image2 = await uploader.upload(file2, {
                                transformation: [
                                    { width: 400, height: 300, crop: "fill" },
                                ]
                            })
                            const image3 = await uploader.upload(file3, {
                                transformation: [
                                    { width: 400, height: 300, crop: "fill" },
                                ]
                            })
                            const image4 = await uploader.upload(file4, {
                                transformation: [
                                    { width: 400, height: 300, crop: "fill" },
                                ]
                            })
                            let data = [
                                { "public_id": image1.public_id, "url": image1.url },
                                { "public_id": image2.public_id, "url": image2.url },
                                { "public_id": image3.public_id, "url": image3.url },
                                { "public_id": image4.public_id, "url": image4.url },
                            ]
                            await restaurant.findByIdAndUpdate({ _id: req.session.restaurant.restaurantId }, { $set: { profile_pic: data } }).then(async (data) => {
                                for (let i = 0; i < data.profile_pic.length; i++) {
                                    await uploader.destroy(data.profile_pic[i]?.public_key)
                                }
                            }).catch((err) => {
                                next(err)
                            })

                        }

                        restaurant.findByIdAndUpdate({ _id: req.session.restaurant.restaurantId }, { $set: { ...rest, profile_completed: true } }).then(async (updatedData) => {
                            res.redirect("/restaurant/profile")
                        })

                    } else {
                        req.session.err = "password is not matched"
                        res.redirect("/restaurant/profile")
                    }
                })
            })
        } catch (err) {
            next(err)
        }
    },
    editProfilPicGet: (req, res, next) => {
        try {
            restaurant.findById({ _id: req.params.restaurant_id }).then(() => {

            })
        } catch (err) {
            next(err)
        }
    },
    saveTablePost: (req, res) => {
        const table = {
            chair: req.body.total_chair,
            tables: req.body.total_table,
        }
        restaurant.findById({
            _id: req.session.restaurant.restaurantId, "tables": {
                $in: { "chair": parseInt(req.body.total_chair) }
            }
        }).then((restaurantDetails) => {
            let flag = 0;
            bcrypt.compare(req.body.password, restaurantDetails.password).then((status) => {
                if (status) {
                    restaurantDetails.tables?.map((table, index) => {
                        if (table.chair === req.body.total_chair) {
                            flag = 1
                        }
                    })
                    if (flag === 1) {
                        restaurant.updateOne({ _id: req.session.restaurant.restaurantId, "tables.chair": parseInt(req.body.total_chair) }, { $set: { "tables.$.table": parseInt(req.body.total_table) } }, { new: true }).then((restaurantnew) => {
                            res.redirect("/restaurant/profile")
                        })
                    } else {
                        restaurant.updateOne({ _id: req.session.restaurant.restaurantId }, {
                            $push: { tables: { "chair": parseInt(req.body.total_chair), "table": parseInt(req.body.total_table) } }
                        }).then((restaurantnew) => {
                            res.redirect("/restaurant/profile")
                        })
                    }
                } else {
                    req.session.err = "password not matched"
                    res.redirect('/restaurant/profile')
                }
            })
        })
    },
    deleteTablePost: (req, res) => {
        restaurant.updateOne({ "_id": req.session.restaurant.restaurantId }, { $pull: { "tables": { "_id": req.params.table_id } } }).then((response) => {
            if (response.modifiedCount > 0) {
                res.json({ status: true, message: "table deleted successfully" })
            } else {
                res.json({ status: false, message: "table not deleted" })
            }
        }).catch(() => {
            res.json({ status: false, message: "table not deleted" })
        })
    },
    addProductGet: async (req, res) => {
        const Category = await category.find()
        res.render("restaurant/addProduct", { restaurantHeader: true, restaurant: true, Category })
    },
    addProductPost: async (req, res, next) => {
        try {
            const file = await dataUri(req.file).content
            await uploader.upload(file,).then((result) => {
                req.body.category = mongoose.Types.ObjectId(req.body.category)
                let productData = {
                    ...req.body, product_image: result.url
                }
                restaurant.findByIdAndUpdate({ _id: req.session.restaurant.restaurantId }, { $push: { menu: { ...productData } } }).then(() => {
                    res.redirect('/restaurant/add-products');
                }).catch(() => {
                    res.redirect('/restaurant/add-products');
                })
            })
        } catch (err) {
            next(err)
        }
    },
    editProductGet: (req, res, next) => {
        restaurant.findById({ _id: req.session.restaurant.restaurantId, "menu._id": req.params.product_id }, { menu: 1 }).then(async (menu) => {
            const filteredMenu = menu.menu.filter((dish) => dish._id == req.params.product_id)
            const categoryData = await category.find({})
            res.render("restaurant/editProduct", { restaurantHeader: true, restaurant: true, filteredMenu: filteredMenu[0], Category: categoryData })
        }).catch((err) => next(err))
    },
    editProductPost: async (req, res, next) => {
        try {
            if (req.file) {
                const file = await dataUri(req.file).content
                await uploader.upload(file, {
                    transformation: [
                        { width: 400, height: 300, crop: "fill" },
                    ]
                }).then((result) => {
                    let productData = {
                        "menu.$.product_name": req.body.product_name,
                        "menu.$.category": req.body.category,
                        "menu.$.stock": Number(req.body.stock),
                        "menu.$.price": Number(req.body.price),
                        "menu.$.product_image": result.url
                    }
                    restaurant.updateOne({ _id: req.session.restaurant.restaurantId, "menu._id": req.params.product_id }, { $set: { ...productData } }).then(() => {
                        res.redirect('/restaurant/add-products');
                    }).catch(() => {
                        res.redirect('/restaurant/add-products');
                    })
                })
            }
        } catch (err) {
            next(err)
        }
    },
    addServiceGet: (req, res, next) => {
        restaurant.find({ _id: req.session.restaurant.restaurantId }, { services: 1 }).then((services) => {
            const err = req.session.Err
            req.session.Err = null
            res.render("restaurant/addService", { restaurantHeader: true, restaurant: true, services: services[0].services, err })
        }).catch((err) => next(err))
    },
    editServiceGet: (req, res) => {
        try {
            restaurant.find({ _id: req.session.restaurant.restaurantId, "service._id": req.params.service_id }, { services: 1 }).then((services) => {
                const service = services[0].services.filter((service) => service._id == req.params.service_id)
                res.render("restaurant/editservice", { restaurantHeader: true, restaurant: true, services: service[0] })
            })
        } catch (err) {
            next(err)
        }
    },
    addServicePost: async (req, res, next) => {
        try {

            req.body.title = req.body.title.toLowerCase()
            const data = {
                title: req.body.title?.charAt(0).toUpperCase() + req.body.title.slice(1)
            }
            const serviceAlreadyExist = await restaurant.find({ "services.title": data.title })
            if (Object.keys(serviceAlreadyExist).length === 0) {
                restaurant.findByIdAndUpdate({ _id: req.session.restaurant.restaurantId }, { $push: { "services": { ...data } } }, { new: true }).then((services) => {
                    req.session.Err = "service added"
                    res.redirect('/restaurant/add-service')
                }).catch((err) => next(err))
            } else {
                req.session.Err = "already Exist "
                res.redirect('/restaurant/add-service')
            }
        } catch (err) {
            next(err)
        }
    },

    updateService: (req, res, next) => {
        try {
            restaurant.findOneAndUpdate({ _id: mongoose.Types.ObjectId(req.session.restaurant.restaurantId), "services.title": req.body?.oldTitle }, { $set: { "services.$.title": req.body.title } }).then((services) => {
                res.redirect('/restaurant/manage-services')
            })
        } catch (err) {
            next(err)
        }
    },
    signupGet: (req, res) => {
        res.render("restaurant/login", { restaurantHeader: true, restaurant: true })
    },


    forgotPasswordGet: (req, res) => {
        res.render('restaurant/forgotPassword', { restaurantHeader: true, restaurant: true })
    },
    changePasswordGet: (req, res) => {
        res.render('restaurant/changePassword', { restaurantHeader: true, restaurantId: req.params.restaurant_id, restaurant: true })
    },
    changePasswordPost: (req, res, next) => {
        bcrypt.hash(req.body.password, Number(process.env.SALT_ROUND)).then((hashedPassword) => {
            restaurant.findByIdAndUpdate({ _id: req.params.restaurant_id }, { $set: { "password": hashedPassword } }).then(() => {
                req.session.err = "password changed successfully"
                res.redirect("/restaurant/login")
            })
        }).catch((err) => {
            next(err)
        })
    },
    changePasswordviaProfilePost: (req, res, next) => {
        try {
            restaurant.findById({ _id: req.session.restaurant.restaurantId }).then((restaurantDetails) => {
                bcrypt.compare(req.body.currentPassword, restaurantDetails.password).then((status) => {
                    if (status) {
                        bcrypt.hash(req.body.newPassword, Number(process.env.process.env.SALT_ROUND)).then((hashedPassword) => {
                            restaurant.findByIdAndUpdate({ _id: req.params.restaurant_id }, { $set: { "password": hashedPassword } }).then(() => {
                                req.session.err = "password changed successfully"
                                req.session.restaurant = null;
                                res.redirect("/restaurant/login")
                            })
                        }).catch((err) => {
                            console.log("err");
                        })
                    }
                })
            })
        } catch (err) {
            next(err)
        }
    },
    restaurantLogout: (req, res) => {
        req.session.restaurant = null;
        res.redirect('/restaurant/login')
    }

}