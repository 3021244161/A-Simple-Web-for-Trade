/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "lwbol4tx7o0r0mb",
    "created": "2026-03-19 14:20:50.891Z",
    "updated": "2026-03-19 14:20:50.891Z",
    "name": "banned_ips",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "f4aeokqn",
        "name": "ip",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": true,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "kfk4kz0s",
        "name": "reason",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      }
    ],
    "indexes": [],
    "listRule": null,
    "viewRule": null,
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("lwbol4tx7o0r0mb");

  return dao.deleteCollection(collection);
})
