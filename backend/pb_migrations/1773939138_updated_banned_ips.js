/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("lwbol4tx7o0r0mb")

  // remove
  collection.schema.removeField("kxk5niur")

  // remove
  collection.schema.removeField("ubcysixe")

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

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("lwbol4tx7o0r0mb")

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

  // remove
  collection.schema.removeField("2ul22jt2")

  // remove
  collection.schema.removeField("ml34hc5b")

  return dao.saveCollection(collection)
})
