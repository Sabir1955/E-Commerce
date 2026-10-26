const { query } = require("../database/db");

async function check() {
  const tables = await query(`
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    ORDER BY table_name, ordinal_position
  `);
  const imageCols = tables.rows.filter(r => 
    r.column_name.toLowerCase().includes("image") || 
    r.column_name.toLowerCase().includes("file") ||
    r.data_type === "bytea"
  );
  console.log("=== Image/File/Bytea Columns in PostgreSQL ===");
  console.table(imageCols);

  const allTables = await query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `);
  console.log("=== All Tables in Database ===");
  console.log(allTables.rows.map(r => r.table_name));

  const sampleProducts = await query(`
    SELECT id, name, image_url, image_file_id, images, image_file_ids 
    FROM products 
    LIMIT 5
  `);
  console.log("=== Sample Products Image Fields ===");
  console.log(sampleProducts.rows);

  process.exit(0);
}

check().catch(e => {
  console.error(e);
  process.exit(1);
});
