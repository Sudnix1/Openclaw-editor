// migrations/add-image-url-to-keywords.js
exports.up = async function(db) {
  return db.runSql(`
    ALTER TABLE keywords 
    ADD COLUMN image_url TEXT;
  `);
};

exports.down = async function(db) {
  return db.runSql(`
    ALTER TABLE keywords 
    DROP COLUMN image_url;
  `);
};