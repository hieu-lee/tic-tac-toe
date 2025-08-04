import colors from 'colors';
import { diffChars, diffWords } from 'diff';

const this0 = 'Street Address: __________';
const other0 = 'Street Address: YOOOOOO';

const diff0 = diffChars(this0, other0);

// // green for additions, red for deletions
// diff.forEach((part) => {
//   let text = part.added ? colors.green(part.value) :
//     part.removed ? colors.red(part.value) :
//       part.value;
//   process.stderr.write(text);
// });

// Only print added part
diff0.forEach((part) => {
  if (part.added) {
    process.stderr.write(colors.green(part.value));
  }
});

console.log();

console.log("---")

const this1 = 'First Name: __________ ,Last Name: __________';
const other1 = 'First Name: Thanh Tung ,Last Name: VU';

const diff1 = diffWords(this1, other1);

// Only print added part
diff1.forEach((part) => {
  if (part.added) {
    process.stderr.write(` ${colors.green(part.value)}`);
  }
  if (part.removed) {
    process.stderr.write("\n");
  }
});

console.log();
