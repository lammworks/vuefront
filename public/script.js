// Parse the URL query string
const urlParams = new URLSearchParams(window.location.search);

// Get the form element
const form = document.getElementById('paymentForm');

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