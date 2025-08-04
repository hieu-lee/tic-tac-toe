const multiPlaceholders = 'First Name: __________ ,Last Name: __________';
const pattern = '__________';

const rg = new RegExp(pattern, 'g')
console.log(multiPlaceholders.match(rg)?.length)
