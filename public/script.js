// Parse the URL query string
const urlParams = new URLSearchParams(window.location.search);

// Get the form element
const form = document.getElementById('paymentForm');

// Set a cookie before submitting the form
function setCookie(name, value, minutes) {
  let expires = "";
  if (minutes) {
    const date = new Date();
    date.setTime(date.getTime() + (minutes * 60 * 1000)); // Set the expiration time in minutes
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + (value || "") + expires + "; path=/; Secure; SameSite=None";
}

// Example of setting a cookie valid for 10 minutes
setCookie("session_cookie", "session_value", 10);  // Set a cookie valid for 10 minutes

// Insert the payment initiation data into the form
for (const [key, value] of urlParams) {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = key;
  input.value = value;
  form.appendChild(input);
}

// Automatically submit the form
form.submit();
