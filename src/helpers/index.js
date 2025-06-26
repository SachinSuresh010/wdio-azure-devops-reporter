import { readFileSync } from 'fs';
import { extname } from 'path';

export default new class Helpers{
    constructor(){

    }

    /**
     * Convert any number to a 8-digit hex number
     * @param {string | number} number Number
     * @returns {string} Hex Number
     */
    toEightDigitHex(number){
        // Convert the number to a hexadecimal string
        let hexString = number.toString(16);

        // Pad with leading zeros if less than 8 digits
        while (hexString.length < 8) {
            hexString = '0' + hexString;
        }

        return hexString;
    }
}