const express = require("express");
const adminController = require("../controllers/adminController");

const router = express.Router();

router.get("/users", adminController.getUsers);
router.post("/users", adminController.createUser);
router.patch("/users/:id", adminController.updateUser);

router.get("/companies", adminController.getCompanies);
router.post("/companies", adminController.createCompany);

router.get("/stores", adminController.getStores);
router.post("/stores", adminController.createStore);

module.exports = router;
