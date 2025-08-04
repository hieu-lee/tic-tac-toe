import ISO6391 from 'iso-639-1';

// 0 is not truthy
if (0) {
  console.log("dmm")
}

console.log(new RegExp("(______________)|(______)|(____)|(___)", 'g'))
console.log(new RegExp("(______________)|(______)|(____)|(___)", 'g')
  .test("______________ (“Prospect”) in favor of WorldQuant, Investment Software Vietnam LLC (the “Company”),"))

ISO6391.getAllCodes().forEach((name) => {
  console.log(name);
})
console.log(ISO6391.getName('vi')); 
