# MarketFresh Backend (Node.js)

Backend Express + SQLite pour :
- Catalogue produits (légumes/viandes)
- Panier
- Commandes
- Paiement (mock)
- Chaîne du froid (Sprint B)

## Démarrage

```bash
cd backend
copy .env.example .env
npm install
npm run dev
```

- API: `http://localhost:4000`
- Healthcheck: `GET /health`

## Variables d'environnement

Voir `.env.example`.

- `PORT` (défaut 4000)
- `CORS_ORIGIN` (défaut `http://localhost:3000`)
- `DB_PATH` (défaut `./data/marketfresh.sqlite`)
- `PAYMENT_PROVIDER` (défaut `mock`)

## API

Contrat OpenAPI: `openapi.yaml`

Exemples de requêtes (VS Code REST Client): `api.http`

### Produits

- `GET /api/products` (optionnel: `?type=veg|meat`)
- `GET /api/products/:id`

Exemple:
```bash
curl "http://localhost:4000/api/products?type=veg"
```

Champs utiles:
- `origin` (origine)
- `freshnessDate` + `freshnessDays` (compteur fraîcheur)
- `coldChain` (uniquement pour `type=meat` via `/api/products/:id`)

### Panier

- `POST /api/carts` → crée un panier
- `GET /api/carts/:id` → récupère le panier
- `PUT /api/carts/:id/items` → ajoute/modifie une ligne
  - body: `{ "productId": "uuid", "quantity": 2 }`
- `DELETE /api/carts/:id/items/:productId` → supprime une ligne

### Chaîne du froid (Sprint B)

- `GET /api/meat/cold-chain/:cartId`

Retourne un résumé des contraintes (températures min/max et temps max hors froid) si le panier contient de la viande.

### Commandes

- `POST /api/orders`
  - body:
    ```json
    {
      "cartId": "uuid",
      "customer": {
        "name": "Ada",
        "email": "ada@example.com",
        "phone": "0600000000",
        "deliveryAddress": "1 rue de la Paix, 75000 Paris"
      }
    }
    ```
- `GET /api/orders/:id`

### Paiement (mock)

- `POST /api/payments/intent` → crée un intent
  - body: `{ "orderId": "uuid" }`
- `POST /api/payments/confirm` → confirme (marque la commande `paid`)
  - body: `{ "paymentIntentId": "uuid" }`

## Notes

- La DB est seedée automatiquement au premier démarrage (quelques légumes + viandes).
- Ce backend est pensé pour être consommé par un front Next.js (CORS configurable).
