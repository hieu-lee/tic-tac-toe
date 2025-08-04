import { getFills } from '@/utils/utils';

const this1 = 'First Name: _____-_____ ,Last Name: _______';
const other1 = 'First Name: Thanh Tung ,Last Name: VU';
const other2 = 'First Na: Thanh Tung ,Last Name: VU';
const other3 = 'First Name: _____-_____ ,Last Name: VU';
const pat = '(_____-_____)|(_______)'

console.log(getFills(this1, other1, pat)); // { ok: true, fills: [ 'Thanh Tung', 'VU' ] })
console.log(getFills(this1, other2, pat)); // { ok: false, fills: [] }
console.log(getFills(this1, other3, pat)); // {ok: true, fills: [null ,'VU'] }}

const a = 'This Confidentiality Agreement (this “Agreement”) made this ___ day of ____ in the year ______ by'
const b = 'This Confidentiality Agreement (this “Agreement”) made this 180 day of ____ in the year BRUHHH by'
const c = '(______________)|(______)|(____)|(___)'
console.log(getFills(a, b, c)); // { ok: true, fills: [ '180', 'null' ,'BRUHHH' ] }

// Zero-width edge case
const d = 'First Name: __________​'
const e = 'First Name: Duc Hieu'
const f = '(__________)|(//____)'
console.log(getFills(d, e, f)); //{ ok: true, fills: [ 'Duc Hieu' ] }

