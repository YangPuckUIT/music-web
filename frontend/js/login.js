const createBtn = document.querySelector(".create");
const backBtn = document.querySelector(".back");

const loginForm = document.querySelector(".login-form");
const signupForm = document.querySelector(".signup-form");

// sang Sign Up
createBtn.addEventListener("click", () => {
  loginForm.style.display = "none";
  signupForm.style.display = "block";

  document.body.classList.add("active"); // thêm để sign up
});

// quay lại Login
backBtn.addEventListener("click", () => {
  signupForm.style.display = "none";
  loginForm.style.display = "block";

  document.body.classList.remove("active"); // thêm để sign up
});