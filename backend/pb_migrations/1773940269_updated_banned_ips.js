/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("lwbol4tx7o0r0mb")

  // remove
  collection.schema.removeField("vdhquo72")

  // remove
  collection.schema.removeField("vgb3glto")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "qvjkwdbg",
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
    "id": "wsscud3k",
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
    "id": "vdhquo72",
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
    "id": "vgb3glto",
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
  collection.schema.removeField("qvjkwdbg")

  // remove
  collection.schema.removeField("wsscud3k")

  return dao.saveCollection(collection)
})
