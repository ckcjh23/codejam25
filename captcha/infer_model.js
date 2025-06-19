// calculates model output
function get_model_output(input) {
    // values from previous layer
    let vals = input.slice();

    // iterate over the network hidden layers
    for (let layer = 0; layer < layer_count; layer++) {
        let size = model.layer_sizes[layer];

        // next hidden state
        let next = (new Array(size)).fill(0);

        // calculate the value for each perceptron in hidden layer
        for (let i = 0; i < model.layer_sizes[layer]; i++) {
            // sum up the outputs from previous layers multiplied by the corresponding weights
            for (let connection of model.weights[layer][i]) {
                next[i] += vals[connection[0]] * connection[1];
            }

            // add the bias term
            next[i] += model.biases[layer][i];

            // if not the last layer, apply the ReLU activation function
            if (layer < layer_count - 1 && next[i] < 0)
                next[i] = 0;
        }

        vals = next;
    }

    return vals;
}

// gets drawing class predictions
function get_predictions(input) {
    output = get_model_output(input);

    // sort indices by decreasing output values
    indices = Array.from(Array(class_count).keys());
    indices.sort((el1, el2) => (output[el1] < output[el2]));

    return indices;
}