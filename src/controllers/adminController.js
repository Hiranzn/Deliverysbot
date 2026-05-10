const adminService = require("../services/adminService");

async function getUsers(req, res, next) {
  try {
    const users = await adminService.listUsers();
    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
}

async function createUser(req, res, next) {
  try {
    const user = await adminService.createUser(req.body);
    res.status(201).json({
      message: "Usuário criado com sucesso",
      user
    });
  } catch (error) {
    next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    const user = await adminService.updateUser(req.params.id, req.body);
    res.status(200).json({
      message: "Usuário atualizado com sucesso",
      user
    });
  } catch (error) {
    next(error);
  }
}

async function getCompanies(req, res, next) {
  try {
    const companies = await adminService.listCompanies();
    res.status(200).json(companies);
  } catch (error) {
    next(error);
  }
}

async function createCompany(req, res, next) {
  try {
    const company = await adminService.createCompany(req.body);
    res.status(201).json({
      message: "Empresa criada com sucesso",
      company
    });
  } catch (error) {
    next(error);
  }
}

async function getStores(req, res, next) {
  try {
    const stores = await adminService.listStores();
    res.status(200).json(stores);
  } catch (error) {
    next(error);
  }
}

async function createStore(req, res, next) {
  try {
    const store = await adminService.createStore(req.body);
    res.status(201).json({
      message: "Loja criada com sucesso",
      store
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getUsers,
  createUser,
  updateUser,
  getCompanies,
  createCompany,
  getStores,
  createStore
};
