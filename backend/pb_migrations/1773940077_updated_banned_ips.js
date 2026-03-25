/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("lwbol4tx7o0r0mb")

  // remove
  collection.schema.removeField("2ul22jt2")

  // remove
  collection.schema.removeField("ml34hc5b")

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

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("lwbol4tx7o0r0mb")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "2ul22jt2",
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
    "id": "ml34hc5b",
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
  collection.schema.removeField("vdhquo72")

  // remove
  collection.schema.removeField("vgb3glto")

  return dao.saveCollection(collection)
})
