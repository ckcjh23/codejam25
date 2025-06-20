// SETTINGS

// how many top answers to consider as correct - the higher the value, the easier it is to complete the captcha
// top k accuracies on validation set for some values of k are included below
// (may be irrelevant, since the dataset will likely differ from the captcha drawings, but I figured including the metric might help with choosing the value):
// topk = 1 ---> 84.3% accuracy
// topk = 2 ---> 92.1% accuracy
// topk = 3 ---> 94.6% accuracy
// topk = 5 ---> 96.7% accuracy
const topk = 3;

// how many rounds
const round_count = 5;

// how much time to wait after each submission (in seconds)
const fake_loading_time = 3;

// canvas stroke width - DO NOT CHANGE for best results
const stroke_width = 2;

// contrast factor used when downscaling the image - DO NOT CHANGE for best results
const contrast_factor = 1.7;

// how much can the user draw before the "pen" stops writing
// the user then has to let go of LMB and press it again to continue drawing
// negative values disable this feature
const stroke_length_limit = 100;

// whether to guarantee a fail for the first time the user reaches the last round
// it mostly means that there is just more rounds, but seems like there's not
const guaranteed_fail = true;

// if the drawing has this many or fewer non-zero pixels after rescaling to 32x32, it's considered as a fail
// this is to prevent the user from spamming "submit" and hoping they get a target class that is the top prediction for an empty image
const pixel_count_fail_thresh = 5;

// END OF SETTINGS


const classes = ["an airplane", "an apple", "a bowtie", "a butterfly", "a camera", "a circle", "a crown", "a diamond", "a donut", "a drill", "a dumbbell", "an envelope", "a floor lamp", "a giraffe", "a hamburger", "a hammer", "a hand", "headphones", "an hourglass", "a ladder", "a line", "a lollipop", "a mountain", "an octopus", "pants", "a pear", "a picture frame", "a rainbow", "a rake", "rollerskates", "a sailboat", "a saxophone", "a smiley face", "a snowflake", "a snowman", "a spreadsheet", "a square", "stairs", "a star", "a stethoscope", "the sun", "a swing set", "a t-shirt", "a table", "a television", "The Eiffel Tower", "a triangle", "an umbrella", "a wine bottle", "a wine glass"];

const width = 256, height = 256;

let canvas;
let ctx;

let target_class = 0;

let drawing = false;

let prev_x = 0, prev_y = 0;
let active_touch_id = 0;

let round = 0;

let current_stroke_length = 0;

let reached_last_round = (round_count <= 1);


function init_canvas() {
    // get drawing context
    canvas = document.getElementById("drawable_canvas");
    ctx = canvas.getContext("2d");

    // set canvas settings
    canvas.width = width;
    canvas.height = height;
    ctx.strokeStyle = "white";
    ctx.lineWidth = stroke_width;

    // initialise the puzzle
    new_task();

    // mouse events (for pc)
    canvas.addEventListener("mousedown", start_drawing);
    canvas.addEventListener("mouseup", stop_drawing);
    canvas.addEventListener("mouseout", stop_drawing);
    canvas.addEventListener("mousemove", move);
    // events for toggling the info overlay
    document.getElementById("info_overlay").addEventListener("click", (e) => {change_visibility("info_overlay", false);});
    document.getElementById("info").addEventListener("click", (e) => {change_visibility("info_overlay", true);});

    // touch events (for mobile)
    canvas.addEventListener("touchstart", start_drawing);
    canvas.addEventListener("touchend", stop_drawing);
    canvas.addEventListener("touchcancel", stop_drawing);
    canvas.addEventListener("touchmove", move);

    // submit button
    document.getElementById("submit").addEventListener("click", submit);
}

// helper function that returns true if the event is a touch event
function is_touch_event(e) {
    return e.type.substr(0, 5) === "touch";
}

// helper function that retrieves the canvas drawing x coordinate
function get_event_x(e) {
    if (is_touch_event(e)) {
        for (let touch of e.changedTouches) {
            if (touch.identifier == active_touch_id) return touch.pageX - canvas.offsetLeft;
        }
        return prev_x;
    }
    else 
        return e.offsetX;
}

// helper function that retrieves the canvas drawing y coordinate
function get_event_y(e) {
    if (is_touch_event(e)) {
        for (let touch of e.changedTouches) {
            if (touch.identifier == active_touch_id) return touch.pageY - canvas.offsetTop;
        }
        return prev_y;
    }
    else 
        return e.offsetY;
}

// start drawing after click/touch
function start_drawing(e) {
    if (is_touch_event(e)) {
        if (active_touch_id != 0) return;
        active_touch_id = e.targetTouches[0].identifier;
    }
    drawing = true;
    current_stroke_length = 0;
    prev_x = get_event_x(e);
    prev_y = get_event_y(e);
}

// stop drawing
function stop_drawing(e) {
    if (is_touch_event(e)) {
        if (active_touch_id == 0) return;

        for (let touch of e.targetTouches) {
            // if the active touch is still drawing, return
            if (touch.identifier == active_touch_id) return;
        }
        // otherwise, disable drawing
        active_touch_id = 0;
    }
    drawing = false;
}

// draw on the canvas
function move(e) {
    let curr_x = get_event_x(e);
    let curr_y = get_event_y(e);

    // if LMB is pressed and the stroke length limit is not used up
    if (drawing && (stroke_length_limit < 0 || current_stroke_length < stroke_length_limit)) {
        // draw a line between the previous and current coordinates
        ctx.beginPath();
        ctx.moveTo(prev_x, prev_y);
        ctx.lineTo(curr_x, curr_y);
        ctx.stroke();
        ctx.closePath();
    }

    // calculate line length and add it to current stroke length
    let dx = (curr_x - prev_x);
    let dy = (curr_y - prev_y);
    current_stroke_length += Math.sqrt(dx*dx + dy*dy);

    prev_x = curr_x;
    prev_y = curr_y;
}

// clear the canvas
function erase() {
    ctx.clearRect(0, 0, width, height);
}

// get a random target class and update the prompt text
function new_task() {
    target_class = Math.floor(Math.random() * classes.length);
    document.getElementById("prompt").innerHTML = "Draw <b class=\"bigger_text\">" + classes[target_class] + "</b>";
}

// helper function for translating coordinates to indices in ctx data
function get_pixel_value(data, x, y) {
    return data[4 * (x + width * y)];
}

// rescale to a size compatible with the neural network
function rescale(data) {
    let result = (new Array(32 * 32)).fill(0);

    // scale down by a factor of 8 (from 256x256 to 32x32)
    for (let x = 0; x < 256; x++) {
        for (let y = 0; y < 256; y++) {
            result[Math.floor(x / 8) + Math.floor(y / 8) * 32] += get_pixel_value(data, x, y);
        }
    }

    for (let i = 0; i < 32*32; i++) {
        // normalise the values by dividing by 64 (because each pixel is 8x8 in the original image),
        // apply the contrast factor (to increase brightness of the white pixels) and clamp the values
        result[i] = Math.floor(Math.min(result[i] * contrast_factor / 64, 255));

        // convert the values from [0..255] to [0..1]
        result[i] /= 255;
    }
    return result;
}

// get the data from the canvas and apply the rescaling
function get_input() {
    let data = ctx.getImageData(0, 0, width, height).data;
    return rescale(data);
}

// update the progress bar
function update_progress() {
    document.getElementById("progress_bar").style.width = "calc((" + round + " / " + round_count + ") * 100%)";
}

// hides/shows the element with the specified id
function change_visibility(id, visible) {
    if (visible)
        document.getElementById(id).classList.remove("hidden");
    else
        document.getElementById(id).classList.add("hidden");
}

// check whether the image is correct
function submit(e) {
    // reset error message
    change_visibility("error_message", false);

    let input = get_input();

    let nonzero_pixels_count = 0;
    for (let i = 0; i < 32 * 32; i++) {
        if (input[i] != 0) nonzero_pixels_count++;
    }

    let correct = false;

    // infer the model only if the image has more non-zero pixels than the threshold
    if (nonzero_pixels_count > pixel_count_fail_thresh) {
        let predictions = get_predictions(input);
        let idx_of_target = predictions.indexOf(target_class);
        correct = idx_of_target < topk;
    }

    // if last round and guaranteed fail is on
    if (guaranteed_fail && !reached_last_round && round == round_count - 1) {
        correct = false;
        reached_last_round = true;
    }

    erase();

    // update the score and get new task after fake loading screen ends
    callback = (() => {
        // hide loading screen
        change_visibility("loading_overlay", false);

        // if correct answer
        if (correct) {
            round++;
        }
        else {
            round = 0;
            change_visibility("error_message", true);
        }
        update_progress();
        new_task();
        if (round >= round_count) captcha_success();
    });

    // show fake loading screen and finish 
    change_visibility("loading_overlay", true);
    setTimeout(callback, fake_loading_time * 1000);
}

// this is how you tell the parent window that the CAPTCHA was successful.
function captcha_success() {
    window.top.postMessage("success", '*');
}

init_canvas();
