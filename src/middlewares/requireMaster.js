function requireMaster(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Usuário não autenticado" });
  }

  if (!req.user.isMaster) {
    return res.status(403).json({ error: "Acesso restrito ao usuário master" });
  }

  next();
}

module.exports = requireMaster;
