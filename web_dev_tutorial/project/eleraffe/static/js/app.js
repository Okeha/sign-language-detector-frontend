document.addEventListener("DOMContentLoaded", function (event) {
    // DOM is loaded and ready

    // Set form submit button to pending when clicked
    let elements = document.querySelectorAll("input[type='submit']");

    for (let elem of elements) {
        elem.onclick = function () {
            this.value = "SUBMITTED!";

            // Create submitted message item
            const submitTextElem = document.createElement('p');
            submitTextElem.innerText = 'Form submitted, please wait';
            this.parentNode.appendChild(submitTextElem);

            // Add loading spinner
            const loaderElem = document.createElement('div');
            loaderElem.classList.add("loader");
            this.parentNode.appendChild(loaderElem);
        };
    };
});