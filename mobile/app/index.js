/**
 * Entry point. The app has two faces:
 *
 *   FreeRadicals       the ordinary app — status, your writing, settings
 *   FreeRadicalsBlock  the block screen alone, which is what Android's overlay
 *                      service and iOS's Screen Time shield launch when you
 *                      open a feed app with no window open
 *
 * Registering both means the overlay can host the block screen directly
 * without the rest of the app's chrome around it.
 */
import { AppRegistry } from 'react-native';

import App from './src/App';
import BlockOnly from './src/BlockOnly';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
AppRegistry.registerComponent(`${appName}Block`, () => BlockOnly);
