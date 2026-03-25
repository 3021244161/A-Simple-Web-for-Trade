/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("lwbol4tx7o0r0mb")

  // remove
  collection.schema.removeField("f4aeokqn")

  // remove
  collection.schema.removeField("kfk4kz0s")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "kxk5niur",
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
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ubcysixe",
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
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("lwbol4tx7o0r0mb")

  // add
  collection.schema.addField(new SchemaField({
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
  }))

  // add
  collection.schema.addField(new SchemaField({
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
  }))

  // remove
  collection.schema.removeField("kxk5niur")

  // remove
  collection.schema.removeField("ubcysixe")

  return dao.saveCollection(collection)
})
