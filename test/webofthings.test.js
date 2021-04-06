const data = require("./stub/data");
const settings = require("../lib/util/settings");
const stringify = require("json-stable-stringify-without-jsonify");
const logger = require("./stub/logger");
const zigbeeHerdsman = require("./stub/zigbeeHerdsman");
const flushPromises = () => new Promise(setImmediate);
const MQTT = require("./stub/mqtt");
const Controller = require("../lib/controller");
const fs = require("fs");
const path = require("path");
const WebOfThings = require("../lib/extension/webofthings");
const mockExit = jest.spyOn(process, "exit").mockImplementation(() => {});
const mocksClear = [
    zigbeeHerdsman.permitJoin,
    mockExit,
    MQTT.end,
    zigbeeHerdsman.stop,
    logger.debug,
    MQTT.publish,
    MQTT.connect,
    zigbeeHerdsman.devices.bulb_color.removeFromNetwork,
    zigbeeHerdsman.devices.bulb.removeFromNetwork,
    logger.error,
];

const thingDescription = {
    "@context": ["http://www.w3.org/ns/td"],
    "@type": "ThingModel",
    title: "OSRAM Classic A60 RGBW",
    id: "urn:zigbee2mqtt:0x000b57fffec6a5b2",
    base: "mqtt://localhost",
    securityDefinitions: {
        nosec_sc: {
            scheme: "nosec",
        },
    },
    security: "nosec_sc",
    properties: {
        transition: {
            type: "number",
            writeOnly: true,
            minimum: 0,
            forms: [
                {
                    op: "writeproperty",
                    href: "zigbee2mqtt/bulb/set/set_transition",
                },
            ],
        },
        rememberState: {
            type: "boolean",
            writeOnly: true,
            forms: [
                {
                    href: "zigbee2mqtt/bulb/set/remember_state",
                    op: "writeproperty",
                },
            ],
        },
        state: {
            title: "state",
            description: "On/off state of this light",
            type: "object",
            readOnly: true,
            properties: {
                state: {
                    type: "string",
                    enum: ["ON", "OFF"],
                },
            },
            required: ["state"],
            forms: [
                {
                    op: ["observeproperty", "unobserveproperty"],
                    href: "zigbee2mqtt/bulb",
                },
                {
                    op: "readproperty",
                    href: "zigbee2mqtt/bulb/get/state",
                    "mqv:responseTopic": "zigbee2mqtt/bulb",
                },
            ],
        },
        brightness: {
            title: "brightness",
            description: "Brightness of this light",
            type: "object",
            properties: {
                brightness: {
                    type: "number",
                    minimum: 0,
                    maximum: 254,
                },
                transition: {
                    type: "number",
                    minimum: 0,
                },
            },
            required: ["brightness"],
            forms: [
                {
                    op: ["observeproperty", "unobserveproperty"],
                    href: "zigbee2mqtt/bulb",
                },
                {
                    op: ["writeproperty"],
                    href: "zigbee2mqtt/bulb/set",
                },
                {
                    op: "readproperty",
                    href: "zigbee2mqtt/bulb/get/state",
                    "mqv:responseTopic": "zigbee2mqtt/bulb",
                },
            ],
        },
        linkquality: {
            type: "object",
            properties: {
                linkquality: {
                    type: "number",
                    minimum: 0,
                    maximum: 255,
                    unit: "lqi",
                },
            },
            required: ["linkquality"],
            forms: [
                {
                    op: ["observeproperty", "unobserveproperty"],
                    href: "zigbee2mqtt/bulb",
                },
            ],
        },
    },
    actions: {
        toggle: {
            input: {
                type: "string",
                const: "TOGGLE",
            },
            forms: [
                {
                    op: "invokeaction",
                    href: "zigbee2mqtt/bulb/set/state",
                },
            ],
        },
        on: {
            input: {
                type: "string",
                const: "ON",
            },
            forms: [
                {
                    op: "invokeaction",
                    href: "zigbee2mqtt/bulb/set/state",
                },
            ],
        },
        off: {
            input: {
                type: "string",
                const: "OFF",
            },
            forms: [
                {
                    op: "invokeaction",
                    href: "zigbee2mqtt/bulb/set/state",
                },
            ],
        },
        effect: {
            type: "string",
            enum: [
                "blink",
                "breathe",
                "okay",
                "channel_change",
                "finish_effect",
                "stop_effect",
            ],
            forms: [
                {
                    op: "invokeaction",
                    href: "zigbee2mqtt/bulb/set/effect",
                },
            ],
        },
    },
    events: {},
};

const wotDiscoveryTopicPrefix = "wot/td";

describe("WebOfThings extension", () => {
    beforeEach(async () => {
        zigbeeHerdsman.returnDevices.splice(0);
        controller = new Controller();
        mocksClear.forEach((m) => m.mockClear());
        data.writeDefaultConfiguration();
        settings.reRead();
        data.writeDefaultState();
        settings.set(["webofthings"], true);
    });

    it("Should publish thing descriptions to the correct discovery topic", async () => {

        controller = new Controller(false);
        await controller.start();

        let payload = thingDescription;
        await flushPromises();

        expect(MQTT.publish).toHaveBeenCalledWith(
            `${wotDiscoveryTopicPrefix}/bulb`,
            stringify(payload),
            { retain: true, qos: 0 },
            expect.any(Function)
        );
    });
});
