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

// The payment fields must be rendered and signed by the server for one store
// order. Never build them from the URL: anyone can craft a link whose fields
// are signed for a different merchant profile.
if (form && form.elements.namedItem('signature')) {
  form.submit();
}
