import(/*webpackChunkName:'title'*/ "./title").then((res) => {
  console.log(res.default);
});

import(/*webpackChunkName:'sum'*/ "./sum").then((res) => {
  console.log(res.default);
});
