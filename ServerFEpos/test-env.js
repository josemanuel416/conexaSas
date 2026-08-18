require('dotenv').config();

console.log('=== TEST DE VARIABLES DE ENTORNO ===\n');
console.log('SOFTWARE_ID:', process.env.SOFTWARE_ID);
console.log('CLAVE_TECNICA:', process.env.CLAVE_TECNICA);
console.log('\nLongitud SOFTWARE_ID:', process.env.SOFTWARE_ID?.length);
console.log('Longitud CLAVE_TECNICA:', process.env.CLAVE_TECNICA?.length);
