const lanches = [
    {id: 1, nome: "X-Burguer", preco: 15.00, categoria: "lanches"},
    {id: 2, nome: "X-Tudo", preco: 25.00, categoria: "lanches"},
    {id: 3, nome: "X-Frango", preco: 18.00, categoria: "lanches"},
];
const bebidas = [
    {id: 4, nome: "Coca-Cola", preco: 5.00, categoria: "bebidas"},
    {id: 5, nome: "Guaraná", preco: 4.00, categoria: "bebidas"},
    {id: 6, nome: "Suco de Laranja", preco: 6.00, categoria: "bebidas"},
];

module.exports = {
    menu: [...lanches, ...bebidas],
    categorias: {
        lanches,
        bebidas
    }
};